const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtRlBFHRViiLrjzmlEvxgI8-1UNwfrJWJU7fsej4eO6dLOEEzozvd_03KmgWhAIZonrzb2QupMcvVK/pub?gid=0&single=true&output=csv";

// --- DECOUPLED MONARCH SETTINGS ---
const MONARCH_BOSSES = [
    "Monarch CH 1",
    "Monarch CH 2",
    "Monarch CH 3",
];

// Global Variables
window.globalCsvData = null;
window.currentDayOffset = null;
window.notifiedBosses = new Set(); 

// The Ping Sound 
const alertAudio = new Audio('SoundAlert.mp3');

document.addEventListener("DOMContentLoaded", () => {
    // 1. Load Theme
    const savedColor = localStorage.getItem('neoTimerThemeColor');
    if (savedColor) document.documentElement.style.setProperty('--accent-color', savedColor);

    // 2. Load Volume
    const savedVolume = localStorage.getItem('neoTimerVolume');
    if (savedVolume !== null) {
        alertAudio.volume = parseFloat(savedVolume);
    } else {
        alertAudio.volume = 0.2;
    }

    // 3. Load Timer Toggle
    const timerToggle = document.getElementById('timer-toggle');
    const savedToggle = localStorage.getItem('neoTimerToggleState');
    if (timerToggle) {
        if (savedToggle !== null) timerToggle.checked = savedToggle === 'true';
        timerToggle.addEventListener('change', (e) => {
            localStorage.setItem('neoTimerToggleState', e.target.checked);
            if (window.globalCsvData) tick(); 
        });
    }

    // 4. Load Sound Toggle
    const soundToggle = document.getElementById('sound-toggle');
    const savedSound = localStorage.getItem('neoTimerSoundState');
    if (soundToggle) {
        if (savedSound !== null) soundToggle.checked = savedSound === 'true';
        soundToggle.addEventListener('change', (e) => localStorage.setItem('neoTimerSoundState', e.target.checked));
    }

    // 5. Load Summer Time (DST) Toggle
    const dstToggle = document.getElementById('dst-toggle');
    const savedDst = localStorage.getItem('neoTimerDST');
    if (dstToggle) {
        if (savedDst !== null) dstToggle.checked = savedDst === 'true';
        dstToggle.addEventListener('change', (e) => {
            localStorage.setItem('neoTimerDST', e.target.checked);
            if (window.globalCsvData) {
                window.currentDayOffset = null; // Force UI rebuild
                tick(); 
            }
        });
    }

    // 6. Color Picker
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            const selectedColor = e.target.getAttribute('data-color');
            document.documentElement.style.setProperty('--accent-color', selectedColor);
            localStorage.setItem('neoTimerThemeColor', selectedColor);
        });
    });

    // 7. Setup Settings Modal & Volume Slider
    const modal = document.getElementById('settings-modal');
    const cog = document.getElementById('settings-btn');
    const closeBtn = document.querySelector('.close-modal');
    
    const volSlider = document.getElementById('volume-slider');
    const volDisplay = document.getElementById('volume-display');
    const testBtn = document.getElementById('test-sound-btn');

    if (volSlider) {
        volSlider.value = alertAudio.volume;
        volDisplay.innerText = Math.round(alertAudio.volume * 100) + '%';
        
        volSlider.addEventListener('input', (e) => {
            const newVol = parseFloat(e.target.value);
            alertAudio.volume = newVol;
            volDisplay.innerText = Math.round(newVol * 100) + '%';
            localStorage.setItem('neoTimerVolume', newVol);
        });
    }

    if (testBtn) {
        testBtn.addEventListener('click', () => {
            alertAudio.currentTime = 0; 
            alertAudio.play().catch(e => console.log("Audio play blocked", e));
        });
    }

    cog.addEventListener('click', () => {
        populateSettings();
        modal.style.display = 'block';
    });
    
    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Fetch Data
    Papa.parse(sheetUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true, 
        complete: function(results) {
            window.globalCsvData = results.data;
            setInterval(tick, 1000);
            tick(); 
        }
    });
});

// --- SETTINGS POPULATOR (REGIONS) ---
function populateSettings() {
    const list = document.getElementById('region-alert-list');
    if (!window.globalCsvData) return;
    
    const regionNames = [...new Set(window.globalCsvData.map(b => b.Region))]
        .filter(Boolean)
        .filter(r => r.toLowerCase() !== 'monarch')
        .sort();
        
    regionNames.push("Monarch");

    let mutedRegions = JSON.parse(localStorage.getItem('neoTimerMutedRegions')) || [];

    list.innerHTML = regionNames.map(name => `
        <div class="boss-alert-item">
            <span class="boss-alert-name">${name}</span>
            <label class="switch">
                <input type="checkbox" data-region="${name}" ${mutedRegions.includes(name) ? '' : 'checked'} class="region-mute-toggle">
                <span class="slider round"></span>
            </label>
        </div>
    `).join('');

    document.querySelectorAll('.region-mute-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const rName = e.target.dataset.region;
            let currentMuted = JSON.parse(localStorage.getItem('neoTimerMutedRegions')) || [];
            
            if (e.target.checked) {
                currentMuted = currentMuted.filter(n => n !== rName);
            } else {
                if (!currentMuted.includes(rName)) currentMuted.push(rName);
            }
            localStorage.setItem('neoTimerMutedRegions', JSON.stringify(currentMuted));
        });
    });
}

// --- THE MASTER ENGINE ---
function tick() {
    if (!window.globalCsvData) return;
    const now = new Date();
    
    const savedDst = localStorage.getItem('neoTimerDST');
    if (savedDst === 'true') {
        now.setHours(now.getHours() - 1);
    }

    const nowSec = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

    const activeOffset = getActiveDayOffset(window.globalCsvData, nowSec, now);

    if (window.currentDayOffset !== activeOffset) {
        window.currentDayOffset = activeOffset;
        buildDashboard(window.globalCsvData, activeOffset, now);
    }

    updateTopClock(now, nowSec);
    updateTimers(nowSec, activeOffset);
}

function getActiveDayOffset(data, nowSec, now) {
    const todayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);
    const todaysStandardBosses = data.filter(row => row.Weekday === todayStr && row.Region && row.Region.toLowerCase() !== 'monarch');
    const hasActiveBosses = todaysStandardBosses.some(boss => (boss.TargetSec + 300) > nowSec);
    return hasActiveBosses ? 0 : 1; 
}

// --- CLOCKS & RESETS ---
function updateTopClock(now, nowSec) {
    document.getElementById('top-clock').innerText = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
    
    let dDiff = 21600 - nowSec; 
    if (dDiff <= 0) dDiff += 86400;
    const dailyEl = document.getElementById('daily-reset');
    if (dailyEl) dailyEl.innerText = formatDuration(dDiff * 1000);

    const day = now.getDay();
    let daysUntilWed = (3 - day + 7) % 7;
    if (daysUntilWed === 0 && nowSec >= 21600) daysUntilWed = 7;
    const weeklySec = (daysUntilWed * 86400) + (21600 - nowSec);
    const weeklyEl = document.getElementById('weekly-reset');
    if (weeklyEl) {
        const d = Math.floor(weeklySec / 86400);
        weeklyEl.innerText = `${d > 0 ? d + 'd ' : ''}${formatDuration((weeklySec % 86400) * 1000)}`;
    }
}

// --- UI BUILDER ---
function buildDashboard(data, offset, now) {
    const grid = document.getElementById('timers-grid');
    grid.innerHTML = ''; 
    
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + offset);
    const displayDayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate);
    const isTomorrow = offset > 0;

    const displayStandardBosses = data.filter(row => row.Weekday === displayDayStr && row.Region && row.Region.toLowerCase() !== 'monarch');
    const activeRegions = [...new Set(displayStandardBosses.map(row => row.Region))];

    activeRegions.forEach(region => {
        const col = document.createElement('div');
        col.className = 'region-column';
        
        const titleExtra = isTomorrow ? ` <span style="font-size:10px; color:var(--accent-color);">(Tomorrow)</span>` : ``;
        col.innerHTML = `<h3>${region.toUpperCase()}${titleExtra}</h3><div class="card-container"></div>`;
        const container = col.querySelector('.card-container');
        
        const regionBosses = displayStandardBosses.filter(row => row.Region === region);
        
        regionBosses.forEach(boss => {
            const card = document.createElement('div');
            card.className = 'boss-card standard-card';
            card.dataset.targetSec = boss.TargetSec; 
            card.dataset.targetTime = boss.TargetTime;
            card.dataset.bossName = boss.BossName; 
            card.dataset.region = boss.Region; 

            card.innerHTML = `
                <p class="boss-name">${boss.BossName}</p>
                <p class="boss-time">Time: ${boss.TargetTime}</p>
                <div class="countdown-wrapper"><div class="countdown">--</div></div>`;
            container.appendChild(card);
        });

        grid.appendChild(col);
    });

    buildMonarchColumn(grid);
}

function buildMonarchColumn(grid) {
    const col = document.createElement('div');
    col.className = 'region-column';
    // This is the line that was changed:
    col.innerHTML = `<h3>MONARCHS <span style="font-size:10px; color:var(--accent-color);">(Server-Time)</span></h3><div class="card-container monarch-container"></div>`;
    const container = col.querySelector('.card-container');

    const savedKills = JSON.parse(localStorage.getItem('neoMonarchKills')) || {};

    MONARCH_BOSSES.forEach(bossName => {
        const card = document.createElement('div');
        card.className = 'boss-card monarch-card';
        card.dataset.bossName = bossName;
        card.dataset.region = "Monarch"; 

        const savedTime = savedKills[bossName] || "";

        card.innerHTML = `
            <p class="boss-name">${bossName}</p>
            <div class="monarch-controls">
                <span class="monarch-label">Last Kill Time:</span>
                <input type="text" class="monarch-time-input" data-boss="${bossName}" value="${savedTime}" placeholder="HH:MM" maxlength="5">
            </div>
            <p class="time-since-kill">Time since kill: <span class="kill-timer">--</span></p>
            <div class="countdown-wrapper">
                <div class="estimated-label">ESTIMATED SPAWN IN</div>
                <div class="countdown">--</div>
            </div>`;
        container.appendChild(card);
    });

    grid.appendChild(col);

    document.querySelectorAll('.monarch-time-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const bName = e.target.dataset.boss;
            const bTime = e.target.value.trim();
            
            if (bTime === "") {
                let currentKills = JSON.parse(localStorage.getItem('neoMonarchKills')) || {};
                currentKills[bName] = "";
                localStorage.setItem('neoMonarchKills', JSON.stringify(currentKills));
                tick(); 
                return;
            }

            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(bTime)) {
                alert("Please enter a valid 24h time (e.g., 08:30 or 14:45)");
                const currentKills = JSON.parse(localStorage.getItem('neoMonarchKills')) || {};
                e.target.value = currentKills[bName] || "";
                return;
            }
            
            let currentKills = JSON.parse(localStorage.getItem('neoMonarchKills')) || {};
            currentKills[bName] = bTime;
            localStorage.setItem('neoMonarchKills', JSON.stringify(currentKills));
            
            tick(); 
        });
    });
}

// --- TIMER MATH & ALERTS ---
function updateTimers(nowSec, activeOffset) {
    const timerToggle = document.getElementById('timer-toggle');
    const isTimerOn = timerToggle ? timerToggle.checked : true;
    
    const soundToggle = document.getElementById('sound-toggle');
    const isGlobalSoundOn = soundToggle ? soundToggle.checked : false;
    const mutedRegions = JSON.parse(localStorage.getItem('neoTimerMutedRegions')) || [];

    // Update Standard Bosses
    document.querySelectorAll('.standard-card').forEach(card => {
        const countdownEl = card.querySelector('.countdown');
        const targetSec = parseInt(card.dataset.targetSec, 10);
        const bName = card.dataset.bossName;
        const regionName = card.dataset.region; 
        
        const spawnId = `${bName}_${targetSec}_${activeOffset}`;
        let timeRemaining; 

        card.classList.remove('dimmed');
        countdownEl.classList.remove('spawning');

        const diffSec = (targetSec + (86400 * activeOffset)) - nowSec;
        timeRemaining = diffSec; 

        if (diffSec > 0) {
            countdownEl.innerText = isTimerOn ? formatDuration(diffSec * 1000) : `Announcement at: ${card.dataset.targetTime}`;
            card.dataset.priority = "1";
        } else if (diffSec <= 0 && diffSec > -300) { 
            countdownEl.innerText = `Spawning in: ${formatDuration((300 + diffSec) * 1000)}`;
            countdownEl.classList.add('spawning');
            card.dataset.priority = "0";
        } else {
            countdownEl.innerText = `Spawned`;
            card.classList.add('dimmed');
            card.dataset.priority = "2";
        }

        handleAudio(timeRemaining, isGlobalSoundOn, mutedRegions, regionName, spawnId);
    });

    // Update Monarch Bosses
    document.querySelectorAll('.monarch-card').forEach(card => {
        const countdownEl = card.querySelector('.countdown');
        const killTimerEl = card.querySelector('.kill-timer');
        const inputEl = card.querySelector('.monarch-time-input');
        const bName = card.dataset.bossName;
        
        const killTimeStr = inputEl.value;
        const spawnId = `Monarch_${bName}`;
        
        card.classList.remove('dimmed');
        countdownEl.classList.remove('spawning');

        if (!killTimeStr) {
            killTimerEl.innerText = "--";
            countdownEl.innerText = "Awaiting Time";
            card.dataset.priority = "3";
            return;
        }

        const [kh, km] = killTimeStr.split(':').map(Number);
        const killSec = (kh * 3600) + (km * 60);

        let timeSinceKill = nowSec - killSec;
        if (timeSinceKill < 0) timeSinceKill += 86400; 

        killTimerEl.innerText = formatDuration(timeSinceKill * 1000);
        
        const spawnIn = 7200 - timeSinceKill; 
        let timeRemaining = spawnIn;

        if (spawnIn > 0) {
            countdownEl.innerText = formatDuration(spawnIn * 1000);
            card.dataset.priority = "1";
        } else if (timeSinceKill <= 18000) { 
            countdownEl.innerText = `In Window`;
            countdownEl.classList.add('spawning'); 
            card.dataset.priority = "0"; 
        } else { 
            countdownEl.innerText = `Missed Window`;
            card.dataset.priority = "2"; 
            timeRemaining = 999999; 
        }

        handleAudio(timeRemaining, isGlobalSoundOn, mutedRegions, "Monarch", spawnId);
    });

    // Sort Containers based on priority (WITH SMART SORT FIX)
    document.querySelectorAll('.card-container').forEach(container => {
        const cards = Array.from(container.children);
        const originalOrder = [...cards];

        cards.sort((a, b) => {
            const priorityA = parseInt(a.dataset.priority || "9");
            const priorityB = parseInt(b.dataset.priority || "9");
            
            if (priorityA !== priorityB) return priorityA - priorityB;
            
            const tA = parseInt(a.dataset.targetSec || "0");
            const tB = parseInt(b.dataset.targetSec || "0");
            return tA - tB;
        });

        let orderChanged = false;
        for (let i = 0; i < cards.length; i++) {
            if (cards[i] !== originalOrder[i]) {
                orderChanged = true;
                break;
            }
        }

        if (orderChanged) {
            cards.forEach(card => container.appendChild(card));
        }
    });
}

function handleAudio(timeRemaining, isGlobalSoundOn, mutedRegions, regionName, spawnId) {
    if (timeRemaining <= 300 && timeRemaining > -300) {
        if (isGlobalSoundOn && !mutedRegions.includes(regionName) && !window.notifiedBosses.has(spawnId)) {
            alertAudio.play().catch(e => console.log("Audio play blocked by browser."));
            window.notifiedBosses.add(spawnId); 
        }
    } else if (timeRemaining > 300) {
        window.notifiedBosses.delete(spawnId);
    }
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`;
}
