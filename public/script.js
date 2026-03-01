// SoundWave v3 — Complete Script
// Fixes: artist images, mobile nav spacing, NP modal full screen,
//        swipe gesture for lyrics, dynamic background from cover

const audio = document.getElementById('audioPlayer');
let currentSong = null;
let currentQueue = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let isMuted = false;
let isDragging = false;
let isLoading = false;
let npCurrentPage = 0; // 0 = player, 1 = lyrics
let lyricsCache = {}; // cache fetched lyrics

// ---- SAFE LOCALSTORAGE ----
function lsGet(key, fallback = '[]') {
    try { return JSON.parse(localStorage.getItem(key) || fallback); }
    catch(e) { return JSON.parse(fallback); }
}
function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}

let likedSongs = lsGet('sw_liked');
let recentSongs = lsGet('sw_recent');
audio.volume = 0.8;

// ---- INIT ----
window.addEventListener('DOMContentLoaded', () => {
    const h = new Date().getHours();
    const greetEl = document.getElementById('greetTime');
    if (greetEl) greetEl.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';

    renderRecent();
    renderArtists();
    loadRecommendations();
    initNpSwipe();
    initProgressDrag();
    initVolumeDrag();
    initNpProgressDrag();
    initNpVolumeDrag();

    // FIX: app layout — no player initially
    document.getElementById('appLayout')?.classList.add('no-player');
});

// ---- PAGE NAV ----
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    ['home','search','library'].forEach(n => document.getElementById('si-'+n)?.classList.remove('active'));
    document.getElementById('page-'+name)?.classList.add('active');
    document.getElementById('si-'+name)?.classList.add('active');
    if (name === 'library') renderLiked();
}

function setMobileNav(id) {
    document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

// ---- QUEUE PANEL ----
let queueOpen = false;
function toggleQueue() {
    queueOpen = !queueOpen;
    document.getElementById('queuePanel')?.classList.toggle('hidden', !queueOpen);
    if (queueOpen) renderQueuePanel();
}

function renderQueuePanel() {
    const nowWrap = document.getElementById('queueNowPlaying');
    const nextList = document.getElementById('queueNextList');
    if (!nowWrap || !nextList) return;
    if (currentSong) {
        nowWrap.innerHTML = `
            <div class="queue-section-label">Now Playing</div>
            <div class="queue-item active">
                <img class="queue-item-cover" src="${currentSong.thumbnail||''}" onerror="this.style.opacity=0" alt="">
                <div class="queue-item-info">
                    <div class="queue-item-title">${escHtml(currentSong.title)}</div>
                    <div class="queue-item-artist">${escHtml(currentSong.artist||'')}</div>
                </div>
            </div>`;
    } else {
        nowWrap.innerHTML = `<div class="queue-section-label">Now Playing</div><div class="queue-empty">Belum ada lagu</div>`;
    }
    const next = currentQueue.slice(currentIndex + 1, currentIndex + 11);
    if (!next.length) { nextList.innerHTML = '<div class="queue-empty">Queue kosong</div>'; return; }
    nextList.innerHTML = next.map((s, i) => `
        <div class="queue-item" onclick="playFromQueue(${currentIndex+1+i})">
            <img class="queue-item-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0" alt="">
            <div class="queue-item-info">
                <div class="queue-item-title">${escHtml(s.title)}</div>
                <div class="queue-item-artist">${escHtml(s.artist||'')}</div>
            </div>
        </div>`).join('');
}

// =====================
// NOW PLAYING MODAL — FULL SCREEN
// =====================
function openNowPlaying() {
    if (!currentSong) return;
    const modal = document.getElementById('npModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.style.display = 'flex';
    syncNpModal();
    npGoTo(0); // always start at player page
}

function closeNowPlaying() {
    const modal = document.getElementById('npModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('open');
}

function syncNpModal() {
    if (!currentSong) return;
    // Update cover
    const npCover = document.getElementById('npCover');
    const npPlaceholder = document.getElementById('npCoverPlaceholder');
    if (currentSong.thumbnail) {
        npCover.src = currentSong.thumbnail;
        npCover.style.display = 'block';
        if (npPlaceholder) npPlaceholder.style.display = 'none';
        // Set dynamic blurred background
        const bg = document.getElementById('npBg');
        if (bg) bg.style.backgroundImage = `url(${currentSong.thumbnail})`;
    } else {
        npCover.style.display = 'none';
        if (npPlaceholder) npPlaceholder.style.display = '';
        const bg = document.getElementById('npBg');
        if (bg) bg.style.backgroundImage = 'none';
    }
    document.getElementById('npTitle').textContent = currentSong.title;
    document.getElementById('npArtist').textContent = currentSong.artist || '';
    updateNpLikeBtn();
    updateNpPlayBtn();
}

function updateNpPlayBtn() {
    const icon = document.getElementById('npPlayIcon');
    if (!icon) return;
    icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    document.getElementById('npShuffleBtn')?.classList.toggle('active', isShuffle);
    document.getElementById('npRepeatBtn')?.classList.toggle('active', isRepeat);
}

function updateNpLikeBtn() {
    const btn = document.getElementById('npLikeBtn');
    if (!btn || !currentSong) return;
    const liked = likedSongs.some(s => s.track_url === currentSong.track_url);
    btn.classList.toggle('liked', liked);
    btn.querySelector('i').className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}

// ---- SWIPE NAVIGATION in NP modal ----
function initNpSwipe() {
    const container = document.getElementById('npModal');
    if (!container) return;
    let startX = 0, startY = 0, dist = 0;
    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    container.addEventListener('touchend', (e) => {
        dist = e.changedTouches[0].clientX - startX;
        const distY = Math.abs(e.changedTouches[0].clientY - startY);
        if (Math.abs(dist) > 50 && Math.abs(dist) > distY) {
            if (dist < 0) npGoTo(1); // swipe left → lyrics
            else npGoTo(0); // swipe right → player
        }
    }, { passive: true });
}

function npGoTo(page) {
    npCurrentPage = page;
    const track = document.getElementById('npSwipeTrack');
    if (track) track.style.transform = `translateX(${-page * 50}%)`;
    // Update dots
    document.getElementById('dot0')?.classList.toggle('active', page === 0);
    document.getElementById('dot1')?.classList.toggle('active', page === 1);
    if (page === 1) fetchAndShowLyrics();
}

function goToLyrics() { npGoTo(1); }
function goToPlayer() { npGoTo(0); }

// ---- LYRICS ----
async function fetchAndShowLyrics() {
    if (!currentSong) return;
    const cacheKey = currentSong.track_url;
    const loadingEl = document.getElementById('npLyricsLoading');
    const textEl = document.getElementById('npLyricsText');
    const errorEl = document.getElementById('npLyricsError');
    if (!loadingEl || !textEl || !errorEl) return;

    // Show from cache
    if (lyricsCache[cacheKey]) {
        loadingEl.classList.add('hidden');
        if (lyricsCache[cacheKey] === 'NOT_FOUND') {
            textEl.classList.add('hidden');
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
            textEl.textContent = lyricsCache[cacheKey];
            textEl.classList.remove('hidden');
        }
        return;
    }

    // Show loading
    loadingEl.classList.remove('hidden');
    textEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    const cleanStr = (s) => s?.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s*-\s*$/, '').trim() || '';
    const artist = cleanStr(currentSong.artist);
    const title = cleanStr(currentSong.title.replace(currentSong.artist || '', ''));

    try {
        const res = await fetch(`/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        const data = await res.json();
        loadingEl.classList.add('hidden');
        if (res.ok && data.lyrics) {
            lyricsCache[cacheKey] = data.lyrics;
            textEl.textContent = data.lyrics;
            textEl.classList.remove('hidden');
        } else {
            lyricsCache[cacheKey] = 'NOT_FOUND';
            errorEl.classList.remove('hidden');
        }
    } catch(e) {
        loadingEl.classList.add('hidden');
        lyricsCache[cacheKey] = 'NOT_FOUND';
        errorEl.classList.remove('hidden');
    }
}

// ---- SEARCH ----
let searchTimeout;
['Home','Search'].forEach(suffix => {
    const inp = document.getElementById('searchInput'+suffix);
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
    } catch(e) {}
}

function showSuggestions(items, page) {
    const box = document.getElementById('suggestions'+cap(page));
    if (!box) return;
    box._items = items;
    box.innerHTML = items.map((s, i) => `
        <div class="suggest-item" onclick="playSuggest(${i},'${page}')">
            <img class="suggest-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0" alt="">
            <div class="suggest-info">
                <div class="suggest-title">${escHtml(s.title)}</div>
                <div class="suggest-artist">${escHtml(s.artist||'')}</div>
            </div>
            ${s.duration?`<span class="suggest-duration">${s.duration}</span>`:''}
        </div>`).join('');
    box.classList.remove('hidden');
}

function playSuggest(index, page) {
    const box = document.getElementById('suggestions'+cap(page));
    if (!box?._items) return;
    currentQueue = [...box._items];
    currentIndex = index;
    hideSuggestions(page);
    playFromQueue(index);
}

function hideSuggestions(page) {
    document.getElementById('suggestions'+cap(page))?.classList.add('hidden');
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-hero') && !e.target.closest('.search-wrap')) {
        hideSuggestions('home');
        hideSuggestions('search');
    }
});

async function doSearch(page) {
    const inp = document.getElementById('searchInput'+cap(page));
    const q = inp?.value?.trim();
    if (!q) return;
    hideSuggestions(page);

    const skelId = page==='home' ? 'homeSkeleton' : 'searchSkeleton';
    const resId  = page==='home' ? 'homeResults'  : 'searchResults';
    const errId  = page==='home' ? 'homeError'    : 'searchError';
    const defEl  = document.getElementById('homeDefault');

    document.getElementById(skelId)?.classList.remove('hidden');
    document.getElementById(resId)?.classList.add('hidden');
    document.getElementById(errId)?.classList.add('hidden');
    if (defEl) defEl.classList.add('hidden');

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        document.getElementById(skelId)?.classList.add('hidden');
        if (!res.ok || !data.results?.length) {
            showError(page, data.error || 'Lagu tidak ditemukan 😔');
            return;
        }
        currentQueue = data.results;
        renderSongGrid(resId, data.results);
    } catch(e) {
        document.getElementById(skelId)?.classList.add('hidden');
        showError(page, 'Koneksi gagal. Cek internet lo!');
    }
}

function renderSongGrid(containerId, songs) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.classList.remove('hidden');
    grid.innerHTML = songs.map((s, i) => `
        <div class="song-card ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playFromQueue(${i})">
            <div style="position:relative">
                <img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt="">
                <div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div>
            </div>
            <div class="song-card-title">${currentSong?.track_url===s.track_url?'<span class="playing-bars"><span></span><span></span><span></span></span>':''}${escHtml(s.title)}</div>
            <div class="song-card-artist">${escHtml(s.artist||'')}</div>
            ${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}
        </div>`).join('');
}

function showError(page, msg) {
    document.getElementById(page==='home'?'homeErrorText':'searchErrorText').textContent = msg;
    document.getElementById(page==='home'?'homeError':'searchError')?.classList.remove('hidden');
}

// ---- PLAYBACK ----
async function playFromQueue(index) {
    if (index < 0 || index >= currentQueue.length) return;
    currentIndex = index;
    await playSong(currentQueue[index], currentQueue);
}

async function playSong(song, queue) {
    if (!song?.track_url) return;
    if (isLoading) return;
    if (queue?.length) currentQueue = queue;
    currentSong = song;
    isLoading = true;

    // Update player bar UI
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
    audio.pause();
    audio.src = '';

    document.getElementById('playIcon').className = 'fa-solid fa-circle-notch fa-spin';
    if (document.getElementById('npPlayIcon'))
        document.getElementById('npPlayIcon').className = 'fa-solid fa-circle-notch fa-spin';

    // Show player bar
    const playerBar = document.getElementById('playerBar');
    const appLayout = document.getElementById('appLayout');
    playerBar?.classList.remove('hidden');
    setTimeout(() => playerBar?.classList.add('visible'), 10);
    appLayout?.classList.remove('no-player');

    // Sync NP modal if open
    if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();

    // Clear lyrics cache for new song
    // (keep cache, just reset lyrics display)
    const textEl = document.getElementById('npLyricsText');
    const loadEl = document.getElementById('npLyricsLoading');
    const errEl = document.getElementById('npLyricsError');
    if (textEl) textEl.classList.add('hidden');
    if (loadEl) loadEl.classList.remove('hidden');
    if (errEl) errEl.classList.add('hidden');

    try {
        const res = await fetch(`/api/download?url=${encodeURIComponent(song.track_url)}`);
        const data = await res.json();
        if (!res.ok || !data.download_url) throw new Error(data.error || 'No URL');

        audio.src = data.download_url;
        await audio.play();
        isPlaying = true;
        isLoading = false;

        document.getElementById('vinylDisc')?.classList.add('spinning');
        addToRecent(song);
        updateQueueHighlight();
        if (queueOpen) renderQueuePanel();
        if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();

    } catch(e) {
        isLoading = false;
        if (e.name === 'AbortError') return;
        showToast('❌ Gagal load: ' + (e.message || 'Error'));
        document.getElementById('playIcon').className = 'fa-solid fa-play';
        if (document.getElementById('npPlayIcon'))
            document.getElementById('npPlayIcon').className = 'fa-solid fa-play';
        document.title = 'SoundWave — Music Player';
    }
}

function updateQueueHighlight() {
    document.querySelectorAll('.song-card').forEach((c, i) => {
        const playing = currentQueue[i]?.track_url === currentSong?.track_url;
        c.classList.toggle('playing', playing);
        const t = c.querySelector('.song-card-title');
        if (t) t.innerHTML = (playing ? '<span class="playing-bars"><span></span><span></span><span></span></span>' : '') + escHtml(currentQueue[i]?.title || '');
    });
}

// ---- CONTROLS ----
function togglePlayPause() {
    if (!audio.src) return;
    if (isPlaying) audio.pause(); else audio.play();
}

function updatePlayBtn() {
    const icon = document.getElementById('playIcon');
    if (icon) icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    document.getElementById('vinylDisc')?.classList.toggle('spinning', isPlaying);
    updateNpPlayBtn();
}

function nextSong() {
    if (!currentQueue.length) return;
    currentIndex = isShuffle ? Math.floor(Math.random() * currentQueue.length) : (currentIndex + 1) % currentQueue.length;
    playFromQueue(currentIndex);
}

function prevSong() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    playFromQueue(currentIndex);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    document.getElementById('shuffleBtn')?.classList.toggle('active', isShuffle);
    document.getElementById('npShuffleBtn')?.classList.toggle('active', isShuffle);
    showToast(isShuffle ? '🔀 Shuffle ON' : 'Shuffle OFF');
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeatBtn')?.classList.toggle('active', isRepeat);
    document.getElementById('npRepeatBtn')?.classList.toggle('active', isRepeat);
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
    // Player bar
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressThumb').style.left = pct + '%';
    document.getElementById('timeCurrent').textContent = fmtTime(audio.currentTime);
    document.getElementById('timeTotal').textContent = fmtTime(audio.duration);
    // NP modal
    document.getElementById('npBarFill').style.width = pct + '%';
    document.getElementById('npBarThumb').style.left = pct + '%';
    document.getElementById('npTimeCurrent').textContent = fmtTime(audio.currentTime);
    document.getElementById('npTimeTotal').textContent = fmtTime(audio.duration);
});

audio.addEventListener('ended', () => { if (isRepeat) { audio.currentTime = 0; audio.play(); } else nextSong(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayBtn(); });
audio.addEventListener('play',  () => { isPlaying = true;  updatePlayBtn(); });
audio.addEventListener('error', () => { if (!isLoading) showToast('❌ Audio error.'); isPlaying = false; isLoading = false; updatePlayBtn(); });

// ---- DRAG: PLAYER BAR PROGRESS ----
function initProgressDrag() {
    const bar = document.getElementById('progressBar');
    if (!bar) return;
    const seek = (e) => {
        if (!audio.duration) return;
        const r = bar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (cx - r.left) / r.width));
        audio.currentTime = pct * audio.duration;
        document.getElementById('progressFill').style.width = (pct*100)+'%';
        document.getElementById('progressThumb').style.left = (pct*100)+'%';
    };
    bar.addEventListener('mousedown', (e) => { isDragging = true; seek(e); });
    bar.addEventListener('touchstart', (e) => { isDragging = true; seek(e); }, {passive:true});
    document.addEventListener('mousemove', (e) => { if (isDragging) seek(e); });
    document.addEventListener('touchmove', (e) => { if (isDragging) seek(e); }, {passive:true});
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('touchend', () => { isDragging = false; });
}

// ---- DRAG: PLAYER BAR VOLUME ----
function initVolumeDrag() {
    const bar = document.getElementById('volumeBar');
    if (!bar) return;
    let drag = false;
    const set = (e) => {
        const r = bar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (cx - r.left) / r.width));
        audio.volume = pct;
        document.getElementById('volumeFill').style.width = (pct*100)+'%';
        document.getElementById('npVolFill').style.width = (pct*100)+'%';
        const icon = document.getElementById('volIcon');
        if (icon) icon.className = pct===0 ? 'fa-solid fa-volume-xmark' : pct<.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
    };
    bar.addEventListener('mousedown', (e) => { drag=true; set(e); });
    bar.addEventListener('touchstart', (e) => { drag=true; set(e); }, {passive:true});
    document.addEventListener('mousemove', (e) => { if (drag) set(e); });
    document.addEventListener('touchmove', (e) => { if (drag) set(e); }, {passive:true});
    document.addEventListener('mouseup', () => { drag=false; });
    document.addEventListener('touchend', () => { drag=false; });
}

// ---- DRAG: NP PROGRESS ----
function initNpProgressDrag() {
    const bar = document.getElementById('npBar');
    if (!bar) return;
    let drag = false;
    const seek = (e) => {
        if (!audio.duration) return;
        const r = bar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (cx - r.left) / r.width));
        audio.currentTime = pct * audio.duration;
        document.getElementById('npBarFill').style.width = (pct*100)+'%';
        document.getElementById('npBarThumb').style.left = (pct*100)+'%';
    };
    bar.addEventListener('mousedown', (e) => { drag=true; seek(e); });
    bar.addEventListener('touchstart', (e) => { drag=true; seek(e); }, {passive:true});
    document.addEventListener('mousemove', (e) => { if (drag) seek(e); });
    document.addEventListener('touchmove', (e) => { if (drag) seek(e); }, {passive:true});
    document.addEventListener('mouseup', () => { drag=false; });
    document.addEventListener('touchend', () => { drag=false; });
}

// ---- DRAG: NP VOLUME ----
function initNpVolumeDrag() {
    const bar = document.getElementById('npVolBar');
    if (!bar) return;
    let drag = false;
    const set = (e) => {
        const r = bar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (cx - r.left) / r.width));
        audio.volume = pct;
        document.getElementById('npVolFill').style.width = (pct*100)+'%';
        document.getElementById('volumeFill').style.width = (pct*100)+'%';
    };
    bar.addEventListener('mousedown', (e) => { drag=true; set(e); });
    bar.addEventListener('touchstart', (e) => { drag=true; set(e); }, {passive:true});
    document.addEventListener('mousemove', (e) => { if (drag) set(e); });
    document.addEventListener('touchmove', (e) => { if (drag) set(e); }, {passive:true});
    document.addEventListener('mouseup', () => { drag=false; });
    document.addEventListener('touchend', () => { drag=false; });
}

// ---- KEYBOARD ----
document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const npOpen = document.getElementById('npModal')?.classList.contains('open');
    switch(e.code) {
        case 'Space':   e.preventDefault(); if (audio.src) togglePlayPause(); break;
        case 'ArrowLeft':  e.preventDefault(); if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime-5); break;
        case 'ArrowRight': e.preventDefault(); if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime+5); break;
        case 'ArrowUp':    e.preventDefault(); audio.volume = Math.min(1, audio.volume+.1); syncVolUI(); break;
        case 'ArrowDown':  e.preventDefault(); audio.volume = Math.max(0, audio.volume-.1); syncVolUI(); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyL': if (currentSong) toggleLike(); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': toggleRepeat(); break;
        case 'KeyQ': toggleQueue(); break;
        case 'Escape': if (npOpen) closeNowPlaying(); break;
    }
});

function syncVolUI() {
    const pct = (audio.volume*100)+'%';
    document.getElementById('volumeFill').style.width = pct;
    document.getElementById('npVolFill').style.width = pct;
}

// ---- LIKED SONGS ----
function toggleLike() {
    if (!currentSong) return;
    const idx = likedSongs.findIndex(s => s.track_url === currentSong.track_url);
    if (idx >= 0) { likedSongs.splice(idx, 1); showToast('💔 Dihapus dari Liked Songs'); }
    else { likedSongs.unshift({...currentSong}); showToast('❤️ Ditambahkan ke Liked Songs'); }
    lsSet('sw_liked', likedSongs);
    updateLikeBtn();
    updateNpLikeBtn();
}

function updateLikeBtn() {
    const btn = document.getElementById('likeBtn');
    if (!btn || !currentSong) return;
    const liked = likedSongs.some(s => s.track_url === currentSong.track_url);
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
            <div class="song-row-num">${currentSong?.track_url===s.track_url?'▶':i+1}</div>
            <img class="song-row-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt="">
            <div class="song-row-info">
                <div class="song-row-title">${escHtml(s.title)}</div>
                <div class="song-row-artist">${escHtml(s.artist||'')}</div>
            </div>
            ${s.duration?`<span class="song-row-duration">${s.duration}</span>`:''}
            <button class="song-row-unlike" onclick="event.stopPropagation();unlikeSong(${i})">
                <i class="fa-solid fa-heart" style="color:#f87171"></i>
            </button>
        </div>`).join('');
}

function playLiked(i) { currentQueue=[...likedSongs]; currentIndex=i; playFromQueue(i); }
function unlikeSong(i) { likedSongs.splice(i,1); lsSet('sw_liked',likedSongs); renderLiked(); if(currentSong)updateLikeBtn(); showToast('Dihapus'); }

// ---- RECENT ----
function addToRecent(song) {
    recentSongs = recentSongs.filter(s => s.track_url !== song.track_url);
    recentSongs.unshift({...song});
    if (recentSongs.length > 10) recentSongs = recentSongs.slice(0,10);
    lsSet('sw_recent', recentSongs);
    renderRecent();
}

function renderRecent() {
    const list = document.getElementById('recentList');
    if (!list) return;
    if (!recentSongs.length) { list.innerHTML='<div class="recent-empty">Belum ada lagu</div>'; return; }
    list.innerHTML = recentSongs.map((s,i) => `
        <div class="recent-item" onclick="playRecentSong(${i})">
            <img class="recent-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt="">
            <div class="recent-info">
                <div class="recent-title">${escHtml(s.title)}</div>
                <div class="recent-artist">${escHtml(s.artist||'')}</div>
            </div>
        </div>`).join('');
}

function playRecentSong(i) { currentQueue=[...recentSongs]; currentIndex=i; playFromQueue(i); }

// ---- HOME RECOMMENDATIONS ----
// FIX: Use Wikipedia/LastFM/UI-Avatars for artist images instead of Spotify CDN (which blocks hotlinking)
const FEATURED_ARTISTS = [
    { name:'Taylor Swift', q:'Taylor Swift',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png/440px-191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png' },
    { name:'The Weeknd', q:'The Weeknd',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/The_Weeknd_in_2023.jpg/440px-The_Weeknd_in_2023.jpg' },
    { name:'Billie Eilish', q:'Billie Eilish',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Billie_Eilish_for_Variety_2024.jpg/440px-Billie_Eilish_for_Variety_2024.jpg' },
    { name:'Bruno Mars', q:'Bruno Mars',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Bruno_Mars_2021_V2.jpg/440px-Bruno_Mars_2021_V2.jpg' },
    { name:'wave to earth', q:'wave to earth', img:'' }, // will use initial fallback
    { name:'Doja Cat', q:'Doja Cat',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Doja_Cat_2022.jpg/440px-Doja_Cat_2022.jpg' },
    { name:'Drake', q:'Drake',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Drake_July_2016.jpg/440px-Drake_July_2016.jpg' },
    { name:'SZA', q:'SZA',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/SZA_in_2024.jpg/440px-SZA_in_2024.jpg' },
    { name:'Harry Styles', q:'Harry Styles',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Harry_Styles_2014.jpg/440px-Harry_Styles_2014.jpg' },
    { name:'Olivia Rodrigo', q:'Olivia Rodrigo',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Olivia_Rodrigo_2021.png/440px-Olivia_Rodrigo_2021.png' },
];

// Get color for initial avatar based on name
function nameToColor(name) {
    const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash<<5)-hash);
    return colors[Math.abs(hash) % colors.length];
}

function renderArtists() {
    const row = document.getElementById('artistRow');
    if (!row) return;
    row.innerHTML = FEATURED_ARTISTS.map(a => {
        const initial = a.name.charAt(0).toUpperCase();
        const color = nameToColor(a.name);
        return `
        <div class="artist-chip" onclick="searchArtist('${escHtml(a.q)}')">
            <div class="artist-avatar-wrap">
                ${a.img
                    ? `<img class="artist-avatar-img" src="${a.img}"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                        alt="${escHtml(a.name)}">
                       <div class="artist-avatar-init" style="display:none;background:linear-gradient(135deg,${color},${color}99)">${initial}</div>`
                    : `<div class="artist-avatar-init" style="background:linear-gradient(135deg,${color},${color}99)">${initial}</div>`
                }
            </div>
            <span class="artist-name">${escHtml(a.name)}</span>
        </div>`;
    }).join('');
}

function searchArtist(q) {
    document.getElementById('searchInputHome').value = q;
    doSearch('home');
}

const RECOMMENDED_QUERIES = [
    'Blinding Lights The Weeknd','As It Was Harry Styles',
    'Flowers Miley Cyrus','Anti-Hero Taylor Swift',
    'golden hour kacey musgraves','Die For You The Weeknd',
    'Calm Down Rema','Stay Kid Laroi',
];

async function loadRecommendations() {
    const q = RECOMMENDED_QUERIES[Math.floor(Math.random() * RECOMMENDED_QUERIES.length)];
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const skelEl = document.getElementById('recommendSkeleton');
        const gridEl = document.getElementById('recommendGrid');
        if (!skelEl || !gridEl) return;
        skelEl.classList.add('hidden');
        if (data.results?.length) {
            const songs = data.results.slice(0, 6);
            gridEl._songs = songs;
            gridEl.classList.remove('hidden');
            gridEl.innerHTML = songs.map((s,i) => `
                <div class="song-card" onclick="playRecommend(${i})">
                    <div style="position:relative">
                        <img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt="">
                        <div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div>
                    </div>
                    <div class="song-card-title">${escHtml(s.title)}</div>
                    <div class="song-card-artist">${escHtml(s.artist||'')}</div>
                    ${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}
                </div>`).join('');
        }
    } catch(e) { document.getElementById('recommendSkeleton')?.classList.add('hidden'); }
}

function playRecommend(i) {
    const g = document.getElementById('recommendGrid');
    if (!g?._songs) return;
    currentQueue = [...g._songs]; currentIndex = i; playFromQueue(i);
}

// ---- UTILS ----
function fmtTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    return Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0');
}
function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---- REVEAL ----
const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }});
}, {threshold:.1});
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
