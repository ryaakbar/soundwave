// ============================================
//   SOUNDWAVE — Complete Music Player Script
//   Fixes: keyboard shortcuts, drag progress,
//   safe localStorage, queue panel, tab title,
//   error boundary, duration display, mobile nav
// ============================================

const audio = document.getElementById('audioPlayer');
let currentSong = null;
let currentQueue = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let isMuted = false;
let lastVolume = 0.8;
let isDragging = false;

// ---- SAFE LOCALSTORAGE ----
function lsGet(key, fallback = '[]') {
    try { return JSON.parse(localStorage.getItem(key) || fallback); }
    catch (e) { return JSON.parse(fallback); }
}
function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

let likedSongs = lsGet('sw_liked');
let recentSongs = lsGet('sw_recent');

audio.volume = lastVolume;

// ---- GREETING ----
const greetEl = document.getElementById('greetTime');
if (greetEl) {
    const h = new Date().getHours();
    greetEl.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

// ---- PAGE NAV ----
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const page = document.getElementById('page-' + name);
    if (page) page.classList.add('active');
    const si = document.getElementById('si-' + name);
    if (si) si.classList.add('active');
    if (name === 'library') renderLiked();
}

function setMobileNav(id) {
    document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ---- QUEUE PANEL ----
let queueOpen = false;
function toggleQueue() {
    queueOpen = !queueOpen;
    const panel = document.getElementById('queuePanel');
    if (panel) panel.classList.toggle('hidden', !queueOpen);
    renderQueuePanel();
}

function renderQueuePanel() {
    const nowEl = document.getElementById('queueNowEmpty');
    const nextList = document.getElementById('queueNextList');
    if (!nowEl || !nextList) return;

    if (currentSong) {
        document.getElementById('queueNowPlaying').innerHTML = `
            <div class="queue-section-label">Now Playing</div>
            <div class="queue-item active">
                <img class="queue-item-cover" src="${currentSong.thumbnail || ''}" onerror="this.style.opacity=0.2" alt="">
                <div class="queue-item-info">
                    <div class="queue-item-title">${escHtml(currentSong.title)}</div>
                    <div class="queue-item-artist">${escHtml(currentSong.artist || '')}</div>
                </div>
            </div>
        `;
    }

    const nextSongs = currentQueue.slice(currentIndex + 1, currentIndex + 11);
    if (!nextSongs.length) {
        nextList.innerHTML = '<div class="queue-empty">Queue kosong</div>';
        return;
    }
    nextList.innerHTML = nextSongs.map((s, i) => `
        <div class="queue-item" onclick="playFromQueue(${currentIndex + 1 + i})">
            <img class="queue-item-cover" src="${s.thumbnail || ''}" onerror="this.style.opacity=0.2" alt="">
            <div class="queue-item-info">
                <div class="queue-item-title">${escHtml(s.title)}</div>
                <div class="queue-item-artist">${escHtml(s.artist || '')}</div>
            </div>
        </div>
    `).join('');
}

// ---- SEARCH ----
let searchTimeout;
let lastSearchQuery = { home: '', search: '' };

['Home', 'Search'].forEach(suffix => {
    const inp = document.getElementById('searchInput' + suffix);
    if (!inp) return;
    inp.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = inp.value.trim();
        if (q.length < 2) { hideSuggestions(suffix.toLowerCase()); return; }
        searchTimeout = setTimeout(() => fetchSuggestions(q, suffix.toLowerCase()), 350);
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch(suffix.toLowerCase());
        if (e.key === 'Escape') hideSuggestions(suffix.toLowerCase());
    });
});

async function fetchSuggestions(q, page) {
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.results?.length) showSuggestions(data.results.slice(0, 6), page);
    } catch (e) {}
}

function showSuggestions(items, page) {
    const box = document.getElementById('suggestions' + cap(page));
    if (!box) return;
    box.innerHTML = items.map(s => `
        <div class="suggest-item" onclick="playSong(${JSON.stringify(s).replace(/"/g,'&quot;')},[])">
            <img class="suggest-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0.2" alt="">
            <div class="suggest-info">
                <div class="suggest-title">${escHtml(s.title)}</div>
                <div class="suggest-artist">${escHtml(s.artist||'')}</div>
            </div>
            ${s.duration ? `<span class="suggest-duration">${s.duration}</span>` : ''}
        </div>
    `).join('');
    box.classList.remove('hidden');
}

function hideSuggestions(page) {
    const box = document.getElementById('suggestions' + cap(page));
    if (box) box.classList.add('hidden');
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-hero') && !e.target.closest('.search-wrap')) {
        hideSuggestions('home');
        hideSuggestions('search');
    }
});

async function doSearch(page) {
    const inp = document.getElementById('searchInput' + cap(page));
    const q = inp?.value?.trim();
    if (!q) return;
    lastSearchQuery[page] = q;
    hideSuggestions(page);

    // Show skeleton
    const skelId = page === 'home' ? 'homeSkeleton' : 'searchSkeleton';
    const resId = page === 'home' ? 'homeResults' : 'searchResults';
    const errId = page === 'home' ? 'homeError' : 'searchError';
    const heroEl = document.getElementById('homeHero');

    document.getElementById(skelId).classList.remove('hidden');
    document.getElementById(resId).classList.add('hidden');
    document.getElementById(errId).classList.add('hidden');
    if (heroEl) heroEl.classList.add('hidden');

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        document.getElementById(skelId).classList.add('hidden');

        if (!res.ok || !data.results?.length) {
            showError(page, data.error || 'Lagu tidak ditemukan 😔');
            return;
        }

        currentQueue = data.results;
        renderSongGrid(resId, data.results);

    } catch (e) {
        document.getElementById(skelId).classList.add('hidden');
        showError(page, 'Koneksi gagal. Cek internet lo!');
    }
}

function renderSongGrid(containerId, songs) {
    const grid = document.getElementById(containerId);
    grid.classList.remove('hidden');
    grid.innerHTML = songs.map((s, i) => `
        <div class="song-card ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playFromQueue(${i})" id="card-${i}">
            <div style="position:relative">
                <img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0.2" alt="">
                <div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div>
            </div>
            <div class="song-card-title">
                ${currentSong?.track_url===s.track_url ? '<span class="playing-bars"><span></span><span></span><span></span></span>' : ''}
                ${escHtml(s.title)}
            </div>
            <div class="song-card-artist">${escHtml(s.artist||'')}</div>
            ${s.duration ? `<div class="song-card-duration">${s.duration}</div>` : ''}
        </div>
    `).join('');
}

function showError(page, msg) {
    const errId = page === 'home' ? 'homeError' : 'searchError';
    const errTxt = page === 'home' ? 'homeErrorText' : 'searchErrorText';
    document.getElementById(errTxt).textContent = msg;
    document.getElementById(errId).classList.remove('hidden');
}

// ---- PLAY ----
async function playFromQueue(index) {
    if (index < 0 || index >= currentQueue.length) return;
    currentIndex = index;
    await playSong(currentQueue[index], currentQueue);
}

async function playSong(song, queue) {
    if (!song?.track_url) return;
    if (queue?.length) { currentQueue = queue; }
    currentSong = song;

    // Update UI immediately
    document.getElementById('playerTitle').textContent = song.title;
    document.getElementById('playerArtist').textContent = song.artist || '';
    document.title = `${song.title} — SoundWave`;

    const coverEl = document.getElementById('playerCover');
    const placeholder = document.getElementById('coverPlaceholder');
    if (song.thumbnail) {
        coverEl.src = song.thumbnail;
        coverEl.classList.remove('hidden');
        if (placeholder) placeholder.style.display = 'none';
    } else {
        coverEl.classList.add('hidden');
        if (placeholder) placeholder.style.display = '';
    }

    updateLikeBtn();

    // Show loading state on play button
    document.getElementById('playIcon').className = 'fa-solid fa-circle-notch fa-spin';

    try {
        const res = await fetch(`/api/download?url=${encodeURIComponent(song.track_url)}`);
        const data = await res.json();

        if (!res.ok || !data.download_url) throw new Error(data.error || 'No download URL');

        audio.src = data.download_url;
        await audio.play();
        isPlaying = true;
        document.getElementById('vinylDisc')?.classList.add('spinning');

        addToRecent(song);
        updateQueueHighlight();
        if (queueOpen) renderQueuePanel();

    } catch (e) {
        showToast('❌ Gagal load: ' + (e.message || 'Unknown error'));
        document.getElementById('playIcon').className = 'fa-solid fa-play';
        document.title = 'SoundWave — Music Player';
    }
}

function updateQueueHighlight() {
    document.querySelectorAll('.song-card').forEach((c, i) => {
        const isPlaying = currentQueue[i]?.track_url === currentSong?.track_url;
        c.classList.toggle('playing', isPlaying);
        const titleEl = c.querySelector('.song-card-title');
        if (titleEl) {
            const bars = isPlaying ? '<span class="playing-bars"><span></span><span></span><span></span></span>' : '';
            const text = currentQueue[i]?.title || '';
            titleEl.innerHTML = bars + escHtml(text);
        }
    });
}

// ---- PLAYER CONTROLS ----
function togglePlayPause() {
    if (!audio.src) return;
    if (isPlaying) { audio.pause(); }
    else { audio.play(); }
}

function updatePlayBtn() {
    const icon = document.getElementById('playIcon');
    if (isPlaying) {
        icon.className = 'fa-solid fa-pause';
        document.getElementById('vinylDisc')?.classList.add('spinning');
    } else {
        icon.className = 'fa-solid fa-play';
        document.getElementById('vinylDisc')?.classList.remove('spinning');
    }
}

function nextSong() {
    if (!currentQueue.length) return;
    currentIndex = isShuffle
        ? Math.floor(Math.random() * currentQueue.length)
        : (currentIndex + 1) % currentQueue.length;
    playFromQueue(currentIndex);
}

function prevSong() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    playFromQueue(currentIndex);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    document.getElementById('shuffleBtn').classList.toggle('active', isShuffle);
    showToast(isShuffle ? '🔀 Shuffle ON' : 'Shuffle OFF');
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeatBtn').classList.toggle('active', isRepeat);
    showToast(isRepeat ? '🔁 Repeat ON' : 'Repeat OFF');
}

function toggleMute() {
    isMuted = !isMuted;
    audio.muted = isMuted;
    const icon = document.getElementById('volIcon');
    if (icon) icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    showToast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
}

// ---- AUDIO EVENTS ----
audio.addEventListener('timeupdate', () => {
    if (!audio.duration || isDragging) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressThumb').style.left = pct + '%';
    document.getElementById('timeCurrent').textContent = fmtTime(audio.currentTime);
    document.getElementById('timeTotal').textContent = fmtTime(audio.duration);
});

audio.addEventListener('ended', () => {
    if (isRepeat) { audio.currentTime = 0; audio.play(); }
    else nextSong();
});

audio.addEventListener('pause', () => { isPlaying = false; updatePlayBtn(); });
audio.addEventListener('play', () => { isPlaying = true; updatePlayBtn(); });
audio.addEventListener('error', () => {
    showToast('❌ Audio error. Coba lagi.');
    isPlaying = false; updatePlayBtn();
});

// ---- DRAG PROGRESS BAR ----
const progressBar = document.getElementById('progressBar');
if (progressBar) {
    const seekTo = (e) => {
        if (!audio.duration) return;
        const rect = progressBar.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
        document.getElementById('progressFill').style.width = (pct * 100) + '%';
        document.getElementById('progressThumb').style.left = (pct * 100) + '%';
    };
    progressBar.addEventListener('mousedown', (e) => { isDragging = true; seekTo(e); });
    progressBar.addEventListener('touchstart', (e) => { isDragging = true; seekTo(e); }, { passive: true });
    document.addEventListener('mousemove', (e) => { if (isDragging) seekTo(e); });
    document.addEventListener('touchmove', (e) => { if (isDragging) seekTo(e); }, { passive: true });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('touchend', () => { isDragging = false; });
}

// ---- DRAG VOLUME BAR ----
const volumeBar = document.getElementById('volumeBar');
if (volumeBar) {
    const setVol = (e) => {
        const rect = volumeBar.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        audio.volume = pct;
        lastVolume = pct;
        document.getElementById('volumeFill').style.width = (pct * 100) + '%';
        const icon = document.getElementById('volIcon');
        if (icon) icon.className = pct === 0 ? 'fa-solid fa-volume-xmark' : pct < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
    };
    let volDrag = false;
    volumeBar.addEventListener('mousedown', (e) => { volDrag = true; setVol(e); });
    volumeBar.addEventListener('touchstart', (e) => { volDrag = true; setVol(e); }, { passive: true });
    document.addEventListener('mousemove', (e) => { if (volDrag) setVol(e); });
    document.addEventListener('touchmove', (e) => { if (volDrag) setVol(e); }, { passive: true });
    document.addEventListener('mouseup', () => { volDrag = false; });
    document.addEventListener('touchend', () => { volDrag = false; });
}

// ---- KEYBOARD SHORTCUTS ----
document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            if (audio.src) togglePlayPause();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5);
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            break;
        case 'ArrowUp':
            e.preventDefault();
            audio.volume = Math.min(1, audio.volume + 0.1);
            document.getElementById('volumeFill').style.width = (audio.volume * 100) + '%';
            break;
        case 'ArrowDown':
            e.preventDefault();
            audio.volume = Math.max(0, audio.volume - 0.1);
            document.getElementById('volumeFill').style.width = (audio.volume * 100) + '%';
            break;
        case 'KeyM': toggleMute(); break;
        case 'KeyL': if (currentSong) toggleLike(); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': toggleRepeat(); break;
        case 'KeyQ': toggleQueue(); break;
    }
});

// ---- LIKED SONGS ----
function toggleLike() {
    if (!currentSong) return;
    const idx = likedSongs.findIndex(s => s.track_url === currentSong.track_url);
    if (idx >= 0) {
        likedSongs.splice(idx, 1);
        showToast('💔 Dihapus dari Liked Songs');
    } else {
        likedSongs.unshift({ ...currentSong });
        showToast('❤️ Ditambahkan ke Liked Songs');
    }
    lsSet('sw_liked', likedSongs);
    updateLikeBtn();
}

function updateLikeBtn() {
    const btn = document.getElementById('likeBtn');
    if (!btn) return;
    const liked = likedSongs.some(s => s.track_url === currentSong?.track_url);
    btn.classList.toggle('liked', liked);
    btn.querySelector('i').className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}

function renderLiked() {
    const container = document.getElementById('likedList');
    const countEl = document.getElementById('likedCount');
    if (countEl) countEl.textContent = likedSongs.length + ' lagu';
    if (!container) return;

    if (!likedSongs.length) {
        container.innerHTML = `<div class="empty-state"><i class="fa-regular fa-heart"></i><p>Belum ada lagu yang di-like</p><span>Tekan ❤️ waktu lagu lagi main</span></div>`;
        return;
    }
    container.innerHTML = likedSongs.map((s, i) => `
        <div class="song-row ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playLiked(${i})">
            <div class="song-row-num">${currentSong?.track_url===s.track_url ? '▶' : i+1}</div>
            <img class="song-row-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0.2" alt="">
            <div class="song-row-info">
                <div class="song-row-title">${escHtml(s.title)}</div>
                <div class="song-row-artist">${escHtml(s.artist||'')}</div>
            </div>
            ${s.duration ? `<span class="song-row-duration">${s.duration}</span>` : ''}
            <button class="song-row-unlike" onclick="event.stopPropagation();unlikeSong(${i})" title="Unlike">
                <i class="fa-solid fa-heart" style="color:#f87171"></i>
            </button>
        </div>
    `).join('');
}

function playLiked(index) {
    currentQueue = [...likedSongs];
    currentIndex = index;
    playFromQueue(index);
}

function unlikeSong(index) {
    likedSongs.splice(index, 1);
    lsSet('sw_liked', likedSongs);
    renderLiked();
    if (currentSong) updateLikeBtn();
    showToast('Dihapus dari Liked Songs');
}

// ---- RECENTLY PLAYED ----
function addToRecent(song) {
    recentSongs = recentSongs.filter(s => s.track_url !== song.track_url);
    recentSongs.unshift({ ...song });
    if (recentSongs.length > 10) recentSongs = recentSongs.slice(0, 10);
    lsSet('sw_recent', recentSongs);
    renderRecent();
}

function renderRecent() {
    const list = document.getElementById('recentList');
    if (!list) return;
    if (!recentSongs.length) {
        list.innerHTML = '<div class="recent-empty">Belum ada lagu</div>';
        return;
    }
    list.innerHTML = recentSongs.map((s, i) => `
        <div class="recent-item" onclick="playRecentSong(${i})">
            <img class="recent-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0.2" alt="">
            <div class="recent-info">
                <div class="recent-title">${escHtml(s.title)}</div>
                <div class="recent-artist">${escHtml(s.artist||'')}</div>
            </div>
        </div>
    `).join('');
}

function playRecentSong(index) {
    currentQueue = [...recentSongs];
    currentIndex = index;
    playFromQueue(index);
}

renderRecent();

// ---- UTILS ----
function fmtTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    return Math.floor(sec/60) + ':' + String(Math.floor(sec%60)).padStart(2,'0');
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2800);
}

// ---- REVEAL ----
const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }});
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
