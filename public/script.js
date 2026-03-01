// SoundWave v4 — All Bugs Fixed
// Fix 1: Audio error → retry logic + proper error handling
// Fix 2: Gagal load → auto retry with backoff  
// Fix 3: Artist images → reliable Wikipedia URLs
// Fix 4: Recommendations → infinite scroll + no duplicates
// Fix 5: Player swipe → full card modal like Spotify + lyrics swipe

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
let npCurrentPage = 0;
let lyricsCache = {};
let audioRetryCount = 0;
const MAX_AUDIO_RETRY = 2;

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
    initInfiniteScroll();
    document.getElementById('appLayout')?.classList.add('no-player');
});

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
        nowWrap.innerHTML = `<div class="queue-section-label">Now Playing</div><div class="queue-item active"><img class="queue-item-cover" src="${currentSong.thumbnail||''}" onerror="this.style.opacity=0" alt=""><div class="queue-item-info"><div class="queue-item-title">${escHtml(currentSong.title)}</div><div class="queue-item-artist">${escHtml(currentSong.artist||'')}</div></div></div>`;
    } else {
        nowWrap.innerHTML = `<div class="queue-section-label">Now Playing</div><div class="queue-empty">Belum ada lagu</div>`;
    }
    const next = currentQueue.slice(currentIndex + 1, currentIndex + 11);
    if (!next.length) { nextList.innerHTML = '<div class="queue-empty">Queue kosong</div>'; return; }
    nextList.innerHTML = next.map((s, i) => `<div class="queue-item" onclick="playFromQueue(${currentIndex+1+i})"><img class="queue-item-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0" alt=""><div class="queue-item-info"><div class="queue-item-title">${escHtml(s.title)}</div><div class="queue-item-artist">${escHtml(s.artist||'')}</div></div></div>`).join('');
}

// =====================
// NOW PLAYING MODAL (FIX 5)
// =====================
function openNowPlaying() {
    if (!currentSong) return;
    const modal = document.getElementById('npModal');
    if (!modal) return;
    modal.classList.add('open');
    syncNpModal();
    npGoTo(0);
}

function closeNowPlaying() {
    document.getElementById('npModal')?.classList.remove('open');
}

function syncNpModal() {
    if (!currentSong) return;
    const npCover = document.getElementById('npCover');
    const npPlaceholder = document.getElementById('npCoverPlaceholder');
    if (currentSong.thumbnail) {
        npCover.src = currentSong.thumbnail;
        npCover.style.display = 'block';
        if (npPlaceholder) npPlaceholder.style.display = 'none';
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
    if (isLoading) {
        icon.className = 'fa-solid fa-circle-notch fa-spin';
    } else {
        icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }
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

// FIX 5: Swipe gestures
function initNpSwipe() {
    // Swipe UP on player bar song-info area to open NP modal
    // (only on song-info area, not progress bar - to avoid conflict)
    const pbSongInfo = document.getElementById('playerBar');
    if (pbSongInfo) {
        let pbStartY = 0, pbStartX = 0, pbStartEl = null;
        pbSongInfo.addEventListener('touchstart', (e) => {
            pbStartY = e.touches[0].clientY;
            pbStartX = e.touches[0].clientX;
            pbStartEl = e.target;
        }, { passive: true });
        pbSongInfo.addEventListener('touchend', (e) => {
            // Don't intercept touches on progress bar / controls
            const isCtrl = pbStartEl?.closest('.progress-bar-outer, .ctrl-btn, .play-btn, .like-btn, .volume-bar-outer');
            if (isCtrl) return;
            const dy = pbStartY - e.changedTouches[0].clientY;
            const dx = Math.abs(e.changedTouches[0].clientX - pbStartX);
            if (dy > 35 && dy > dx * 1.2) openNowPlaying();
        }, { passive: true });
    }

    // Modal: left = lyrics, right = player, down = close
    const modal = document.getElementById('npModal');
    if (!modal) return;
    let startX = 0, startY = 0;
    modal.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    modal.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 80 && Math.abs(dy) > Math.abs(dx) && npCurrentPage === 0) {
            closeNowPlaying();
            return;
        }
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) npGoTo(1);
            else npGoTo(0);
        }
    }, { passive: true });
}

function npGoTo(page) {
    npCurrentPage = page;
    const track = document.getElementById('npSwipeTrack');
    if (track) track.style.transform = `translateX(${-page * 50}%)`;
    document.getElementById('dot0')?.classList.toggle('active', page === 0);
    document.getElementById('dot1')?.classList.toggle('active', page === 1);
    if (page === 1) fetchAndShowLyrics();
}
function goToLyrics() { npGoTo(1); }
function goToPlayer() { npGoTo(0); }

async function fetchAndShowLyrics() {
    if (!currentSong) return;
    const cacheKey = currentSong.track_url;
    const loadingEl = document.getElementById('npLyricsLoading');
    const textEl = document.getElementById('npLyricsText');
    const errorEl = document.getElementById('npLyricsError');
    if (!loadingEl || !textEl || !errorEl) return;
    if (lyricsCache[cacheKey]) {
        loadingEl.classList.add('hidden');
        if (lyricsCache[cacheKey] === 'NOT_FOUND') {
            textEl.classList.add('hidden'); errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden'); textEl.textContent = lyricsCache[cacheKey]; textEl.classList.remove('hidden');
        }
        return;
    }
    loadingEl.classList.remove('hidden'); textEl.classList.add('hidden'); errorEl.classList.add('hidden');
    const cleanStr = (s) => s?.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s*-\s*$/, '').trim() || '';
    const artist = cleanStr(currentSong.artist);
    const title = cleanStr(currentSong.title.replace(currentSong.artist || '', ''));
    try {
        const res = await fetch(`/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        const data = await res.json();
        loadingEl.classList.add('hidden');
        if (res.ok && data.lyrics) {
            lyricsCache[cacheKey] = data.lyrics; textEl.textContent = data.lyrics; textEl.classList.remove('hidden');
        } else {
            lyricsCache[cacheKey] = 'NOT_FOUND'; errorEl.classList.remove('hidden');
        }
    } catch(e) {
        loadingEl.classList.add('hidden'); lyricsCache[cacheKey] = 'NOT_FOUND'; errorEl.classList.remove('hidden');
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
    box.innerHTML = items.map((s, i) => `<div class="suggest-item" onclick="playSuggest(${i},'${page}')"><img class="suggest-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0" alt=""><div class="suggest-info"><div class="suggest-title">${escHtml(s.title)}</div><div class="suggest-artist">${escHtml(s.artist||'')}</div></div>${s.duration?`<span class="suggest-duration">${s.duration}</span>`:''}</div>`).join('');
    box.classList.remove('hidden');
}

function playSuggest(index, page) {
    const box = document.getElementById('suggestions'+cap(page));
    if (!box?._items) return;
    currentQueue = [...box._items]; currentIndex = index;
    hideSuggestions(page); playFromQueue(index);
}

function hideSuggestions(page) {
    document.getElementById('suggestions'+cap(page))?.classList.add('hidden');
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-hero') && !e.target.closest('.search-wrap')) {
        hideSuggestions('home'); hideSuggestions('search');
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
        if (!res.ok || !data.results?.length) { showError(page, data.error || 'Lagu tidak ditemukan 😔'); return; }
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
    grid.innerHTML = songs.map((s, i) => `<div class="song-card ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playFromQueue(${i})"><div style="position:relative"><img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt=""><div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div></div><div class="song-card-title">${currentSong?.track_url===s.track_url?'<span class="playing-bars"><span></span><span></span><span></span></span>':''}${escHtml(s.title)}</div><div class="song-card-artist">${escHtml(s.artist||'')}</div>${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}</div>`).join('');
}

function showError(page, msg) {
    document.getElementById(page==='home'?'homeErrorText':'searchErrorText').textContent = msg;
    document.getElementById(page==='home'?'homeError':'searchError')?.classList.remove('hidden');
}

// ---- PLAYBACK (FIX 1 & 2) ----
async function playFromQueue(index) {
    if (index < 0 || index >= currentQueue.length) return;
    currentIndex = index;
    await playSong(currentQueue[index], currentQueue);
}

async function playSong(song, queue, retryCount = 0) {
    if (!song?.track_url) return;
    if (isLoading) return;
    if (queue?.length) currentQueue = queue;
    currentSong = song;
    isLoading = true;
    audioRetryCount = retryCount;

    document.getElementById('playerTitle').textContent = song.title;
    document.getElementById('playerArtist').textContent = song.artist || '';
    document.title = `${song.title} — SoundWave`;

    const coverEl = document.getElementById('playerCover');
    const placeholder = document.getElementById('coverPlaceholder');
    if (song.thumbnail) {
        coverEl.src = song.thumbnail; coverEl.classList.remove('hidden');
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

    const playerBar = document.getElementById('playerBar');
    const appLayout = document.getElementById('appLayout');
    playerBar?.classList.remove('hidden');
    setTimeout(() => playerBar?.classList.add('visible'), 10);
    appLayout?.classList.remove('no-player');

    if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();

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

        // FIX 1: Load audio properly, don't fire play() before src is ready
        audio.src = data.download_url;
        audio.load();

        try {
            await audio.play();
            isPlaying = true; isLoading = false;
            document.getElementById('vinylDisc')?.classList.add('spinning');
            addToRecent(song);
            updateQueueHighlight();
            if (queueOpen) renderQueuePanel();
            if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();
        } catch(playErr) {
            if (playErr.name === 'NotAllowedError') {
                isLoading = false; isPlaying = false;
                document.getElementById('playIcon').className = 'fa-solid fa-play';
                if (document.getElementById('npPlayIcon'))
                    document.getElementById('npPlayIcon').className = 'fa-solid fa-play';
                showToast('▶️ Tap play untuk mulai');
                return;
            }
            // Wait for canplay before retrying
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
                audio.addEventListener('canplay', () => { clearTimeout(timeout); resolve(); }, { once: true });
                audio.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Audio load error')); }, { once: true });
            });
            await audio.play();
            isPlaying = true; isLoading = false;
            document.getElementById('vinylDisc')?.classList.add('spinning');
            addToRecent(song);
            updateQueueHighlight();
            if (queueOpen) renderQueuePanel();
            if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();
        }

    } catch(e) {
        isLoading = false;
        if (e.name === 'AbortError') return;
        // FIX 2: Auto retry
        if (retryCount < MAX_AUDIO_RETRY) {
            showToast(`⏳ Retrying... (${retryCount+1}/${MAX_AUDIO_RETRY})`);
            setTimeout(() => playSong(song, null, retryCount + 1), 1500);
            return;
        }
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
    isMuted = !isMuted; audio.muted = isMuted;
    const icon = document.getElementById('volIcon');
    if (icon) icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    showToast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
}

audio.addEventListener('timeupdate', () => {
    if (!audio.duration || isDragging) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressThumb').style.left = pct + '%';
    document.getElementById('timeCurrent').textContent = fmtTime(audio.currentTime);
    document.getElementById('timeTotal').textContent = fmtTime(audio.duration);
    document.getElementById('npBarFill').style.width = pct + '%';
    document.getElementById('npBarThumb').style.left = pct + '%';
    document.getElementById('npTimeCurrent').textContent = fmtTime(audio.currentTime);
    document.getElementById('npTimeTotal').textContent = fmtTime(audio.duration);
});

audio.addEventListener('ended', () => { if (isRepeat) { audio.currentTime = 0; audio.play(); } else nextSong(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayBtn(); });
audio.addEventListener('play',  () => { isPlaying = true;  updatePlayBtn(); });
audio.addEventListener('error', () => {
    if (isLoading) return; // playSong() handles this
    if (!audio.src) return;
    isPlaying = false; isLoading = false;
    updatePlayBtn();
    if (audioRetryCount < MAX_AUDIO_RETRY && currentSong) {
        audioRetryCount++;
        setTimeout(() => playSong(currentSong, null, audioRetryCount), 1500);
    } else {
        showToast('❌ Audio error — coba lagi');
    }
});

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

function toggleLike() {
    if (!currentSong) return;
    const idx = likedSongs.findIndex(s => s.track_url === currentSong.track_url);
    if (idx >= 0) { likedSongs.splice(idx, 1); showToast('💔 Dihapus dari Liked Songs'); }
    else { likedSongs.unshift({...currentSong}); showToast('❤️ Ditambahkan ke Liked Songs'); }
    lsSet('sw_liked', likedSongs);
    updateLikeBtn(); updateNpLikeBtn();
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
    container.innerHTML = likedSongs.map((s, i) => `<div class="song-row ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playLiked(${i})"><div class="song-row-num">${currentSong?.track_url===s.track_url?'▶':i+1}</div><img class="song-row-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt=""><div class="song-row-info"><div class="song-row-title">${escHtml(s.title)}</div><div class="song-row-artist">${escHtml(s.artist||'')}</div></div>${s.duration?`<span class="song-row-duration">${s.duration}</span>`:''}<button class="song-row-unlike" onclick="event.stopPropagation();unlikeSong(${i})"><i class="fa-solid fa-heart" style="color:#f87171"></i></button></div>`).join('');
}

function playLiked(i) { currentQueue=[...likedSongs]; currentIndex=i; playFromQueue(i); }
function unlikeSong(i) { likedSongs.splice(i,1); lsSet('sw_liked',likedSongs); renderLiked(); if(currentSong)updateLikeBtn(); showToast('Dihapus'); }

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
    list.innerHTML = recentSongs.map((s,i) => `<div class="recent-item" onclick="playRecentSong(${i})"><img class="recent-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt=""><div class="recent-info"><div class="recent-title">${escHtml(s.title)}</div><div class="recent-artist">${escHtml(s.artist||'')}</div></div></div>`).join('');
}

function playRecentSong(i) { currentQueue=[...recentSongs]; currentIndex=i; playFromQueue(i); }

// ---- ARTISTS (FIX 3: reliable image URLs) ----
const FEATURED_ARTISTS = [
    { name:'Taylor Swift', q:'Taylor Swift',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png/440px-191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png' },
    { name:'The Weeknd', q:'The Weeknd',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/The_Weeknd_in_concert_2017.jpg/440px-The_Weeknd_in_concert_2017.jpg' },
    { name:'Billie Eilish', q:'Billie Eilish',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Billie_Eilish_2019_by_Glenn_Francis.jpg/440px-Billie_Eilish_2019_by_Glenn_Francis.jpg' },
    { name:'Bruno Mars', q:'Bruno Mars',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Bruno_Mars_2016.jpg/440px-Bruno_Mars_2016.jpg' },
    { name:'wave to earth', q:'wave to earth', img:'' },
    { name:'Doja Cat', q:'Doja Cat',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Doja_Cat_at_2019_Beautycon_%28cropped%29.jpg/440px-Doja_Cat_at_2019_Beautycon_%28cropped%29.jpg' },
    { name:'Drake', q:'Drake',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Drake_July_2016.jpg/440px-Drake_July_2016.jpg' },
    { name:'SZA', q:'SZA',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/SZA_2017.jpg/440px-SZA_2017.jpg' },
    { name:'Harry Styles', q:'Harry Styles',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Harry_Styles_2014.jpg/440px-Harry_Styles_2014.jpg' },
    { name:'Olivia Rodrigo', q:'Olivia Rodrigo',
      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Olivia_Rodrigo_2021.png/440px-Olivia_Rodrigo_2021.png' },
];

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
        return `<div class="artist-chip" onclick="searchArtist('${escHtml(a.q)}')"><div class="artist-avatar-wrap">${a.img ? `<img class="artist-avatar-img" src="${a.img}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="${escHtml(a.name)}"><div class="artist-avatar-init" style="display:none;background:linear-gradient(135deg,${color},${color}99)">${initial}</div>` : `<div class="artist-avatar-init" style="background:linear-gradient(135deg,${color},${color}99)">${initial}</div>`}</div><span class="artist-name">${escHtml(a.name)}</span></div>`;
    }).join('');
}

function searchArtist(q) {
    document.getElementById('searchInputHome').value = q;
    doSearch('home');
}

// ---- RECOMMENDATIONS (FIX 4: infinite scroll + dedup) ----
const RECOMMENDED_QUERIES = [
    'Blinding Lights The Weeknd','As It Was Harry Styles','Flowers Miley Cyrus',
    'Anti-Hero Taylor Swift','golden hour kacey musgraves','Die For You The Weeknd',
    'Calm Down Rema','Stay Kid Laroi','Heat Waves Glass Animals','Levitating Dua Lipa',
    'Peaches Justin Bieber','Kiss Me More Doja Cat','Good 4 U Olivia Rodrigo',
    'Montero Lil Nas X','Industry Baby Lil Nas X','Shivers Ed Sheeran',
    'Bad Habits Ed Sheeran','Butter BTS','Permission to Dance BTS','Easy Troye Sivan',
    'Rush Troye Sivan','About Damn Time Lizzo','Break My Soul Beyonce',
    'Cuff It Beyonce','Running Up That Hill Kate Bush','Enemy Imagine Dragons',
    'Sharks Imagine Dragons','Wait For U Future Drake','Rich Flex Drake 21 Savage',
    'Superhero Metro Boomin','Creepin Metro Boomin','Unholy Sam Smith Kim Petras',
    'Lift Me Up Rihanna','TQG Karol G Shakira','Ghost Justin Bieber',
    'Love Story Taylor Swift','Cruel Summer Taylor Swift','All Too Well Taylor Swift',
    'Lose You To Love Me Selena Gomez','telepatia kali uchis','Mood 24kGoldn',
    'Essence Wizkid','Watermelon Sugar Harry Styles','Adore You Harry Styles',
    'Demons Imagine Dragons','Natural Imagine Dragons','Thunder Imagine Dragons',
    'Electric Love Borns','Lover Taylor Swift','Cardigan Taylor Swift',
    'Evermore Taylor Swift','folklore Taylor Swift','august Taylor Swift',
    'Drivers License Olivia Rodrigo','Deja Vu Olivia Rodrigo','traitor Olivia Rodrigo',
    'happier Olivia Rodrigo','brutal Olivia Rodrigo','Adan y Eva Aventura',
    'Despacito Luis Fonsi','Lean On Major Lazer','Cheap Thrills Sia',
    'Chandelier Sia','Elastic Heart Sia','Titanium David Guetta',
    'Dynamite BTS','Ditto NewJeans','Hype Boy NewJeans','OMG NewJeans',
    'Attention NewJeans','Cookie NewJeans','Attention Charlie Puth',
    'Marvin Gaye Charlie Puth','See You Again Charlie Puth Wiz Khalifa',
    'Unstoppable Sia','Snowman Sia','Permission Aminé','Summer Walker Over It',
    'Silk Sonic Leave The Door Open','Skate Bruno Mars','Smokin Out The Window Bruno Mars',
    'After Hours The Weeknd','Starboy The Weeknd','Save Your Tears The Weeknd',
    'Midnight Rain Taylor Swift','Bejeweled Taylor Swift','Karma Taylor Swift',
];

let recLoading = false;
let recUsedQueries = new Set();
let allRecSongs = [];

async function loadRecommendations(append = false) {
    if (recLoading) return;
    recLoading = true;
    const skelEl = document.getElementById('recommendSkeleton');
    const gridEl = document.getElementById('recommendGrid');
    if (!gridEl) { recLoading = false; return; }
    if (!append && skelEl) skelEl.classList.remove('hidden');

    // Pick unused query
    const available = RECOMMENDED_QUERIES.filter(q => !recUsedQueries.has(q));
    if (!available.length) recUsedQueries.clear();
    const pool = available.length > 0 ? available : RECOMMENDED_QUERIES;
    const q = pool[Math.floor(Math.random() * pool.length)];
    recUsedQueries.add(q);

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (skelEl) skelEl.classList.add('hidden');
        if (data.results?.length) {
            // Deduplicate by track_url
            const newSongs = data.results.filter(s =>
                !allRecSongs.some(ex => ex.track_url === s.track_url)
            );
            if (newSongs.length === 0) { recLoading = false; return loadRecommendations(append); }
            const startIndex = allRecSongs.length;
            allRecSongs = [...allRecSongs, ...newSongs];
            gridEl.classList.remove('hidden');
            gridEl._songs = allRecSongs;
            if (!append) {
                gridEl.innerHTML = newSongs.map((s, i) => renderRecommendCard(s, startIndex + i)).join('');
            } else {
                newSongs.forEach((s, i) => {
                    const div = document.createElement('div');
                    div.innerHTML = renderRecommendCard(s, startIndex + i);
                    gridEl.appendChild(div.firstElementChild);
                });
            }
        }
    } catch(e) {
        if (skelEl) skelEl.classList.add('hidden');
    }
    recLoading = false;
}

function renderRecommendCard(s, i) {
    return `<div class="song-card" onclick="playRecommend(${i})"><div style="position:relative"><img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1" alt=""><div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div></div><div class="song-card-title">${escHtml(s.title)}</div><div class="song-card-artist">${escHtml(s.artist||'')}</div>${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}</div>`;
}

function playRecommend(i) {
    const g = document.getElementById('recommendGrid');
    if (!g?._songs) return;
    currentQueue = [...g._songs]; currentIndex = i; playFromQueue(i);
}

// FIX 4: Infinite scroll
function initInfiniteScroll() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;
    mainContent.addEventListener('scroll', () => {
        const homePage = document.getElementById('page-home');
        if (!homePage?.classList.contains('active')) return;
        const nearBottom = mainContent.scrollHeight - mainContent.scrollTop - mainContent.clientHeight < 300;
        if (nearBottom && !recLoading) loadRecommendations(true);
    });
}

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
    el.textContent = msg; el.classList.remove('hidden'); el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }});
}, {threshold:.1});
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
