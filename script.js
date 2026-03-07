const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtRlBFHRViiLrjzmlEvxgI8-1UNwfrJWJU7fsej4eO6dLOEEzozvd_03KmgWhAIZonrzb2QupMcvVK/pub?gid=0&single=true&output=csv";

// Global Variables
window.globalCsvData = null;
window.currentDayOffset = null;
window.notifiedBosses = new Set(); 

// Using your local custom sound file
const alertAudio = new Audio('SoundAlert.mp3'); 

document.addEventListener("DOMContentLoaded", () => {
    // 1. Load Theme
    const savedColor = localStorage.getItem('neoTimerThemeColor');
    if (savedColor) document.documentElement.style.setProperty('--accent-color', savedColor);

    // 2. Load Volume (Defaults to 20%)
    const savedVolume = localStorage.getItem('neoTimerVolume');
    if (savedVolume !== null) {
        alertAudio.volume = parseFloat(savedVolume);
    } else {
        alertAudio.volume = 0.2; 
    }

    // 3. Load Toggles (Overlay, Sound, Timer)
    const overlayToggle = document.getElementById('overlay-toggle');
    const savedOverlay = localStorage.getItem('neoTimerOverlayState');
    if (overlayToggle) {
        if (savedOverlay !== null) overlayToggle.checked = savedOverlay === 'true';
        overlayToggle.addEventListener('change', (e) => {
            localStorage.setItem('neoTimerOverlayState', e.target.checked);
            tick(); 
        });
    }

    const timerToggle = document.getElementById('timer-toggle');
    const savedToggle = localStorage.getItem('neoTimerToggleState');
    if (timerToggle) {
        if (savedToggle !== null) timerToggle.checked = savedToggle === 'true';
        timerToggle.addEventListener('change', (e) => {
            localStorage.setItem('neoTimerToggleState', e.target.checked);
            if (window.globalCsvData) tick(); 
        });
    }

    const soundToggle = document.getElementById('sound-toggle');
    const savedSound = localStorage.getItem('neoTimerSoundState');
    if (soundToggle) {
        if (savedSound !== null) soundToggle.checked = savedSound === 'true';
        soundToggle.addEventListener('change', (e) => localStorage.setItem('neoTimerSoundState', e.target.checked));
    }

    // 4. Color Picker
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            const selectedColor = e.target.getAttribute('data-color');
            document.documentElement.style.setProperty('--accent-color', selectedColor);
            localStorage.setItem('neoTimerThemeColor', selectedColor);
        });
    });

    // 5. Setup Settings Modal & Volume Controls
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

    // Fetch CSV Data
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

// --- SETTINGS POPULATOR (VISIBILITY & SOUND) ---
function populateSettings() {
    const list = document.getElementById('region-alert-list');
    if (!window.globalCsvData) return;
    
    const regionNames = [...new Set(window.globalCsvData.map(b => b.Region))].filter(Boolean).sort();
    let mutedRegions = JSON.parse(localStorage.getItem('neoTimerMutedRegions')) || [];
    let hiddenRegions = JSON.parse(localStorage.getItem('neoTimerHiddenRegions')) || [];

    list.innerHTML = regionNames.map(name => `
        <div class="boss-alert-item">
            <span class="boss-alert-name">${name}</span>
            <div class="settings-toggles">
                <label class="switch" title="Toggle Overlay Visibility">
                    <input type="checkbox" data-region="${name}" data-type="visible" ${hiddenRegions.includes(name) ? '' : 'checked'} class="region-setting-toggle">
                    <span class="slider round"></span>
                </label>
                <label class="switch" title="Toggle Sound">
                    <input type="checkbox" data-region="${name}" data-type="sound" ${mutedRegions.includes(name) ? '' : 'checked'} class="region-setting-toggle">
                    <span class="slider round"></span>
                </label>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.region-setting-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const rName = e.target.dataset.region;
            const type = e.target.dataset.type;
            const storageKey = type === 'sound' ? 'neoTimerMutedRegions' : 'neoTimerHiddenRegions';
            
            let currentList = JSON.parse(localStorage.getItem(storageKey)) || [];
            
            if (e.target.checked) {
                currentList = currentList.filter(n => n !== rName);
            } else {
                if (!currentList.includes(rName)) currentList.push(rName);
            }
            localStorage.setItem(storageKey, JSON.stringify(currentList));
            if (type === 'visible') tick(); 
        });
    });
}

// --- THE MASTER ENGINE ---
function tick() {
    if (!window.globalCsvData) return;
    const now = new Date();
    const nowSec = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

    const activeOffset = getActiveDayOffset(window.globalCsvData, nowSec);

    if (window.currentDayOffset !== activeOffset) {
        window.currentDayOffset = activeOffset;
        buildDashboard(window.globalCsvData, activeOffset);
    }

    updateTopClock(now, nowSec);
    updateTimers(nowSec, activeOffset);
}

function getActiveDayOffset(data, nowSec) {
    const todayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
    const todaysStandardBosses = data.filter(row => row.Weekday === todayStr && row.Region && row.Region.toLowerCase() !== 'monarch');
    const hasActiveBosses = todaysStandardBosses.some(boss => (boss.TargetSec + 300) > nowSec);
    return hasActiveBosses ? 0 : 1; 
}

// --- CLOCKS & RESETS ---
function updateTopClock(now, nowSec) {
    document.getElementById('top-clock').innerText = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
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
function buildDashboard(data, offset) {
    const grid = document.getElementById('timers-grid');
    grid.innerHTML = ''; 
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    const displayDayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate);
    const isTomorrow = offset > 0;
    const trueTodayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    const displayStandardBosses = data.filter(row => row.Weekday === displayDayStr && row.Region && row.Region.toLowerCase() !== 'monarch');
    const trueTodayMonarchs = data.filter(row => row.Weekday === trueTodayStr && row.Region && row.Region.toLowerCase() === 'monarch');
    
    const combinedData = [...displayStandardBosses, ...trueTodayMonarchs];
    const activeRegions = [...new Set(combinedData.map(row => row.Region))];

    activeRegions.forEach(region => {
        const col = document.createElement('div');
        col.className = 'region-column';
        
        const titleExtra = (isTomorrow && region.toLowerCase() !== 'monarch') 
            ? ` <span style="font-size:10px; color:var(--accent-color);">(Tomorrow)</span>` 
            : ``;

        col.innerHTML = `<h3>${region.toUpperCase()}${titleExtra}</h3><div class="card-container"></div>`;
        const container = col.querySelector('.card-container');
        
        const regionBosses = combinedData.filter(row => row.Region === region);
        
        regionBosses.forEach(boss => {
            const card = document.createElement('div');
            card.className = 'boss-card';
            
            card.dataset.targetSec = boss.TargetSec; 
            card.dataset.targetTime = boss.TargetTime;
            card.dataset.bossName = boss.BossName; 
            card.dataset.region = boss.Region; 

            if (region.toLowerCase() === 'monarch') {
                card.classList.add('monarch-card');
                card.innerHTML = `
                    <p class="boss-name">${boss.BossName}</p>
                    <p class="time-since-kill">Time since kill: <span class="kill-timer">--</span></p>
                    <div class="countdown-wrapper">
                        <div class="estimated-label">ESTIMATED SPAWN IN</div>
                        <div class="countdown">--</div>
                    </div>`;
            } else {
                card.innerHTML = `
                    <p class="boss-name">${boss.BossName}</p>
                    <p class="boss-time">Time: ${boss.TargetTime}</p>
                    <div class="countdown-wrapper"><div class="countdown">--</div></div>`;
            }
            container.appendChild(card);
        });

        if (region.toLowerCase() === 'monarch') {
            const dropdown = document.createElement('details');
            dropdown.className = 'monarch-dropdown';
            const allMonarchs = data.filter(row => row.Region && row.Region.toLowerCase() === 'monarch');
            const dayOrder = { "Monday":1, "Tuesday":2, "Wednesday":3, "Thursday":4, "Friday":5, "Saturday":6, "Sunday":7 };
            
            allMonarchs.sort((a, b) => {
                if (dayOrder[a.Weekday] !== dayOrder[b.Weekday]) return dayOrder[a.Weekday] - dayOrder[b.Weekday];
                return a.TargetSec - b.TargetSec;
            });

            let listHTML = '';
            allMonarchs.forEach(row => {
                listHTML += `<div class="schedule-row"><span>${row.Weekday}, ${row.BossName}</span> <span>${row.TargetTime}</span></div>`;
            });

            dropdown.innerHTML = `<summary>View All Logged Times</summary><div class="schedule-list">${listHTML}</div>`;
            col.appendChild(dropdown);
        }

        grid.appendChild(col);
    });
}

// --- TIMER MATH, ALERTS & OVERLAY ---
function updateTimers(nowSec, activeOffset) {
    const timerToggle = document.getElementById('timer-toggle');
    const isTimerOn = timerToggle ? timerToggle.checked : true;
    
    const soundToggle = document.getElementById('sound-toggle');
    const isGlobalSoundOn = soundToggle ? soundToggle.checked : false;
    
    const overlayToggle = document.getElementById('overlay-toggle');
    const isOverlayMode = overlayToggle ? overlayToggle.checked : false;

    const mutedRegions = JSON.parse(localStorage.getItem('neoTimerMutedRegions')) || [];
    const hiddenRegions = JSON.parse(localStorage.getItem('neoTimerHiddenRegions')) || [];

    // Dictionary to hold the closest boss for EACH region
    let nextBossesPerRegion = {};

    document.querySelectorAll('.boss-card').forEach(card => {
        const isMonarch = card.classList.contains('monarch-card');
        const countdownEl = card.querySelector('.countdown');
        const targetSec = parseInt(card.dataset.targetSec, 10);
        const bName = card.dataset.bossName;
        const regionName = card.dataset.region; 
        
        const spawnId = `${bName}_${targetSec}_${activeOffset}`;
        let timeRemaining; 

        card.classList.remove('dimmed');
        countdownEl.classList.remove('spawning');

        // Math Logic
        if (isMonarch) {
            const killTimerEl = card.querySelector('.kill-timer');
            let timeSinceKill = nowSec - targetSec;
            if (timeSinceKill < 0) timeSinceKill += 86400; 
            if (killTimerEl) killTimerEl.innerText = formatDuration(timeSinceKill * 1000);
            
            timeRemaining = 9000 - timeSinceKill; 
            if (timeRemaining > 0) {
                countdownEl.innerText = formatDuration(timeRemaining * 1000);
                card.dataset.priority = "1";
            } else {
                countdownEl.innerText = `In Window`;
                countdownEl.classList.add('spawning');
                card.dataset.priority = "0";
            }
        } else {
            timeRemaining = (targetSec + (86400 * activeOffset)) - nowSec;
            if (timeRemaining > 0) {
                countdownEl.innerText = isTimerOn ? formatDuration(timeRemaining * 1000) : `At: ${card.dataset.targetTime}`;
                card.dataset.priority = "1";
            } else if (timeRemaining <= 0 && timeRemaining > -300) { 
                countdownEl.innerText = `Spawning in: ${formatDuration((300 + timeRemaining) * 1000)}`;
                countdownEl.classList.add('spawning');
                card.dataset.priority = "0";
            } else {
                countdownEl.innerText = `Spawned`;
                card.classList.add('dimmed');
                card.dataset.priority = "2";
            }
        }

        // Overlay Logic: Find the closest boss FOR THIS SPECIFIC REGION
        if (!hiddenRegions.includes(regionName) && timeRemaining > -300) {
            if (!nextBossesPerRegion[regionName] || timeRemaining < nextBossesPerRegion[regionName].timeRemaining) {
                nextBossesPerRegion[regionName] = {
                    name: bName,
                    timeRemaining: timeRemaining,
                    text: countdownEl.innerText,
                    isSpawning: timeRemaining <= 0
                };
            }
        }

        // Audio Logic
        if (timeRemaining <= 300 && timeRemaining > -300) {
            if (isGlobalSoundOn && !mutedRegions.includes(regionName) && !window.notifiedBosses.has(spawnId)) {
                alertAudio.play().catch(e => console.log("Audio play blocked by browser."));
                window.notifiedBosses.add(spawnId); 
            }
        } else if (timeRemaining > 300) {
            window.notifiedBosses.delete(spawnId);
        }
    });

    // Handle UI Switching (Grid vs Overlay)
    const grid = document.getElementById('timers-grid');
    const overlay = document.getElementById('overlay-container');
    const overlayWidget = document.getElementById('overlay-widget');

    if (isOverlayMode) {
        grid.style.display = 'none';
        overlay.style.display = 'flex';
        
        overlayWidget.innerHTML = ''; // Clear the widget
        
        const regionsToDisplay = Object.keys(nextBossesPerRegion).sort();

        if (regionsToDisplay.length > 0) {
            regionsToDisplay.forEach(region => {
                const boss = nextBossesPerRegion[region];
                overlayWidget.innerHTML += `
                    <div class="overlay-row">
                        <div class="overlay-region-name">${region}</div>
                        <div class="overlay-boss-name">${boss.name}</div>
                        <div class="overlay-timer ${boss.isSpawning ? 'spawning' : ''}">${boss.text}</div>
                    </div>
                `;
            });
        } else {
            overlayWidget.innerHTML = `<div style="text-align: center; color: var(--text-muted);">All Clear / No Visible Regions</div>`;
        }
    } else {
        grid.style.display = 'flex';
        overlay.style.display = 'none';
        
        // Auto-Sort Grid
        document.querySelectorAll('.card-container').forEach(container => {
            const cards = Array.from(container.children);
            cards.sort((a, b) => {
                if (a.dataset.priority !== b.dataset.priority) return a.dataset.priority - b.dataset.priority;
                return parseInt(a.dataset.targetSec) - parseInt(b.dataset.targetSec);
            });
            cards.forEach(card => container.appendChild(card));
        });
    }
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`;
}
