// SoundWave v5 — Clean rewrite
// Fixes: URL required bug, swipe up player bar, infinite scroll, audio retry

const audio = document.getElementById('audioPlayer');
let currentSong  = null;
let currentQueue = [];
let currentIndex = 0;
let isPlaying    = false;
let isShuffle    = false;
let isRepeat     = false;
let isMuted      = false;
let isDragging   = false;
let isLoading    = false;
let npPage       = 0;
let lyricsCache  = {};

// ---------- LOCALSTORAGE ----------
function lsGet(key, fb = '[]') {
    try { return JSON.parse(localStorage.getItem(key) || fb); } catch { return JSON.parse(fb); }
}
function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let likedSongs  = lsGet('sw_liked');
let recentSongs = lsGet('sw_recent');
audio.volume = 0.8;

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', () => {
    const h = new Date().getHours();
    const g = document.getElementById('greetTime');
    if (g) g.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';

    renderRecent();
    renderArtists();
    loadRecommendations();
    initDrags();
    initSwipe();
    initInfiniteScroll();

    document.getElementById('appLayout')?.classList.add('no-player');
});

// ---------- PAGES ----------
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

// ---------- QUEUE PANEL ----------
let queueOpen = false;
function toggleQueue() {
    queueOpen = !queueOpen;
    document.getElementById('queuePanel')?.classList.toggle('hidden', !queueOpen);
    if (queueOpen) renderQueuePanel();
}
function renderQueuePanel() {
    const nw = document.getElementById('queueNowPlaying');
    const nx = document.getElementById('queueNextList');
    if (!nw || !nx) return;
    nw.innerHTML = currentSong
        ? `<div class="queue-section-label">Now Playing</div><div class="queue-item active"><img class="queue-item-cover" src="${currentSong.thumbnail||''}" onerror="this.style.opacity=0"><div class="queue-item-info"><div class="queue-item-title">${esc(currentSong.title)}</div><div class="queue-item-artist">${esc(currentSong.artist||'')}</div></div></div>`
        : `<div class="queue-section-label">Now Playing</div><div class="queue-empty">Belum ada lagu</div>`;
    const next = currentQueue.slice(currentIndex+1, currentIndex+11);
    nx.innerHTML = next.length
        ? next.map((s,i) => `<div class="queue-item" onclick="playAt(${currentIndex+1+i})"><img class="queue-item-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0"><div class="queue-item-info"><div class="queue-item-title">${esc(s.title)}</div><div class="queue-item-artist">${esc(s.artist||'')}</div></div></div>`).join('')
        : '<div class="queue-empty">Queue kosong</div>';
}

// ---------- NOW PLAYING MODAL ----------
function openNowPlaying() {
    if (!currentSong) return;
    const m = document.getElementById('npModal');
    if (!m) return;
    m.classList.add('open');
    syncNpModal();
    npGoTo(0);
}
function closeNowPlaying() {
    document.getElementById('npModal')?.classList.remove('open');
}
function syncNpModal() {
    if (!currentSong) return;
    const cover = document.getElementById('npCover');
    const ph    = document.getElementById('npCoverPlaceholder');
    const bg    = document.getElementById('npBg');
    if (currentSong.thumbnail) {
        cover.src = currentSong.thumbnail;
        cover.style.display = 'block';
        if (ph) ph.style.display = 'none';
        if (bg) bg.style.backgroundImage = `url(${currentSong.thumbnail})`;
    } else {
        cover.style.display = 'none';
        if (ph) ph.style.display = '';
        if (bg) bg.style.backgroundImage = 'none';
    }
    document.getElementById('npTitle').textContent  = currentSong.title;
    document.getElementById('npArtist').textContent = currentSong.artist || '';
    updateNpLikeBtn();
    updateNpPlayBtn();
}
function updateNpPlayBtn() {
    const ic = document.getElementById('npPlayIcon');
    if (ic) ic.className = isLoading ? 'fa-solid fa-circle-notch fa-spin' : (isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play');
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

// ---------- SWIPE ----------
function initSwipe() {
    initPlayerBarSwipe();
    initModalSwipe();
}

// ---- PLAYER BAR SWIPE ----
// Swipe LEFT  → remove/dismiss current song (stop & hide player)
// Swipe RIGHT → same (dismiss)
// Swipe UP    → open Now Playing modal
// The expand button uses onclick directly — no JS needed for that
function initPlayerBarSwipe() {
    const bar = document.getElementById('playerBar');
    if (!bar) return;

    let tx0 = 0, ty0 = 0, startEl = null;
    let animating = false;

    bar.addEventListener('touchstart', e => {
        tx0 = e.touches[0].clientX;
        ty0 = e.touches[0].clientY;
        startEl = e.target;
        bar.style.transition = 'none'; // disable transition during drag
    }, { passive: true });

    bar.addEventListener('touchmove', e => {
        // Only animate horizontal swipe, ignore if on controls
        if (startEl?.closest('#progressBar,.ctrl-btn,.play-btn,.like-btn,#volumeBar,.volume-bar-outer,.player-expand-btn')) return;
        const dx = e.touches[0].clientX - tx0;
        const dy = Math.abs(e.touches[0].clientY - ty0);
        if (Math.abs(dx) > dy) {
            // Follow finger horizontally
            bar.style.transform = `translateX(${dx}px)`;
            bar.style.opacity   = String(Math.max(0, 1 - Math.abs(dx) / 200));
        }
    }, { passive: true });

    bar.addEventListener('touchend', e => {
        bar.style.transition = ''; // re-enable transition
        const dx = e.changedTouches[0].clientX - tx0;
        const dy = ty0 - e.changedTouches[0].clientY;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        // Ignore if started on controls
        if (startEl?.closest('#progressBar,.ctrl-btn,.play-btn,.like-btn,#volumeBar,.volume-bar-outer,.player-expand-btn')) {
            bar.style.transform = '';
            bar.style.opacity   = '';
            return;
        }

        if (adx > ady && adx > 60) {
            // Horizontal swipe → dismiss player
            dismissPlayer(dx > 0 ? 'right' : 'left');
        } else if (dy > 35 && ady > adx) {
            // Swipe UP → open modal
            bar.style.transform = '';
            bar.style.opacity   = '';
            openNowPlaying();
        } else {
            // Snap back
            bar.style.transform = '';
            bar.style.opacity   = '';
        }
    }, { passive: true });
}

function dismissPlayer(direction) {
    const bar = document.getElementById('playerBar');
    if (!bar) return;
    // Animate out
    bar.style.transition = 'transform .3s ease, opacity .3s ease';
    bar.style.transform  = `translateX(${direction === 'right' ? '110%' : '-110%'})`;
    bar.style.opacity    = '0';
    // Stop audio and hide
    setTimeout(() => {
        audio.pause();
        audio.src = '';
        isPlaying = false;
        currentSong = null;
        bar.classList.add('hidden');
        bar.classList.remove('visible');
        bar.style.transform = '';
        bar.style.opacity   = '';
        document.getElementById('appLayout')?.classList.add('no-player');
        document.getElementById('vinylDisc')?.classList.remove('spinning');
        document.title = 'SoundWave — Music Player';
        updatePlayBtn();
    }, 320);
    toast(direction === 'right' ? '👋 Lagu dihapus' : '👋 Lagu dihapus');
}

// ---- NP MODAL SWIPE ----
// Swipe LEFT  → lyrics page
// Swipe RIGHT → player page
// Swipe DOWN  → close modal
function initModalSwipe() {
    const modal = document.getElementById('npModal');
    if (!modal) return;
    let mx0 = 0, my0 = 0;
    modal.addEventListener('touchstart', e => {
        mx0 = e.touches[0].clientX;
        my0 = e.touches[0].clientY;
    }, { passive: true });
    modal.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - mx0;
        const dy = e.changedTouches[0].clientY - my0;
        if (Math.abs(dy) > Math.abs(dx)) {
            if (dy > 60 && npPage === 0) closeNowPlaying();
        } else if (Math.abs(dx) > 40) {
            if (dx < 0) npGoTo(1);
            else        npGoTo(0);
        }
    }, { passive: true });
}

function npGoTo(page) {
    npPage = page;
    const t = document.getElementById('npSwipeTrack');
    if (t) t.style.transform = `translateX(${-page * 50}%)`;
    document.getElementById('dot0')?.classList.toggle('active', page === 0);
    document.getElementById('dot1')?.classList.toggle('active', page === 1);
    if (page === 1) fetchLyrics();
}
function goToLyrics() { npGoTo(1); }
function goToPlayer()  { npGoTo(0); }

// ---------- LYRICS ----------
async function fetchLyrics() {
    if (!currentSong) return;
    const key  = currentSong.track_url;
    const ldEl = document.getElementById('npLyricsLoading');
    const txEl = document.getElementById('npLyricsText');
    const erEl = document.getElementById('npLyricsError');
    if (!ldEl || !txEl || !erEl) return;

    if (lyricsCache[key]) {
        ldEl.classList.add('hidden');
        if (lyricsCache[key] === 'N/A') { txEl.classList.add('hidden'); erEl.classList.remove('hidden'); }
        else { erEl.classList.add('hidden'); txEl.textContent = lyricsCache[key]; txEl.classList.remove('hidden'); }
        return;
    }
    ldEl.classList.remove('hidden'); txEl.classList.add('hidden'); erEl.classList.add('hidden');
    const clean = s => s?.replace(/\(.*?\)|\[.*?\]/g,'').replace(/\s*-\s*$/,'').trim() || '';
    const artist = clean(currentSong.artist);
    const title  = clean(currentSong.title.replace(currentSong.artist||'',''));
    try {
        const r = await fetch(`/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        const d = await r.json();
        ldEl.classList.add('hidden');
        if (r.ok && d.lyrics) { lyricsCache[key] = d.lyrics; txEl.textContent = d.lyrics; txEl.classList.remove('hidden'); }
        else { lyricsCache[key] = 'N/A'; erEl.classList.remove('hidden'); }
    } catch { ldEl.classList.add('hidden'); lyricsCache[key] = 'N/A'; erEl.classList.remove('hidden'); }
}

// ---------- SEARCH ----------
let searchTimeout;
['Home','Search'].forEach(sfx => {
    const inp = document.getElementById('searchInput'+sfx);
    if (!inp) return;
    inp.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = inp.value.trim();
        if (q.length < 2) { hideSug(sfx.toLowerCase()); return; }
        searchTimeout = setTimeout(() => fetchSug(q, sfx.toLowerCase()), 350);
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  doSearch(sfx.toLowerCase());
        if (e.key === 'Escape') hideSug(sfx.toLowerCase());
    });
});

async function fetchSug(q, page) {
    try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.results?.length) showSug(d.results.slice(0,6), page);
    } catch {}
}
function showSug(items, page) {
    const box = document.getElementById('suggestions'+cap(page));
    if (!box) return;
    box._items = items;
    box.innerHTML = items.map((s,i) => `<div class="suggest-item" onclick="playSug(${i},'${page}')"><img class="suggest-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=0"><div class="suggest-info"><div class="suggest-title">${esc(s.title)}</div><div class="suggest-artist">${esc(s.artist||'')}</div></div>${s.duration?`<span class="suggest-duration">${s.duration}</span>`:''}</div>`).join('');
    box.classList.remove('hidden');
}
function playSug(i, page) {
    const box = document.getElementById('suggestions'+cap(page));
    if (!box?._items) return;
    currentQueue = [...box._items]; currentIndex = i;
    hideSug(page); playAt(i);
}
function hideSug(page) { document.getElementById('suggestions'+cap(page))?.classList.add('hidden'); }
document.addEventListener('click', e => {
    if (!e.target.closest('.search-hero,.search-wrap')) { hideSug('home'); hideSug('search'); }
});

async function doSearch(page) {
    const inp = document.getElementById('searchInput'+cap(page));
    const q   = inp?.value?.trim();
    if (!q) return;
    hideSug(page);
    const skel = page==='home' ? 'homeSkeleton'  : 'searchSkeleton';
    const res  = page==='home' ? 'homeResults'   : 'searchResults';
    const err  = page==='home' ? 'homeError'     : 'searchError';
    document.getElementById(skel)?.classList.remove('hidden');
    document.getElementById(res)?.classList.add('hidden');
    document.getElementById(err)?.classList.add('hidden');
    document.getElementById('homeDefault')?.classList.add('hidden');
    try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        document.getElementById(skel)?.classList.add('hidden');
        if (!r.ok || !d.results?.length) { showErr(page, d.error||'Lagu tidak ditemukan 😔'); return; }
        currentQueue = d.results;
        renderGrid(res, d.results);
    } catch {
        document.getElementById(skel)?.classList.add('hidden');
        showErr(page, 'Koneksi gagal. Cek internet lo!');
    }
}
function renderGrid(id, songs) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.remove('hidden');
    g.innerHTML = songs.map((s,i) => `<div class="song-card ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playAt(${i})"><div style="position:relative"><img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1"><div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div></div><div class="song-card-title">${currentSong?.track_url===s.track_url?'<span class="playing-bars"><span></span><span></span><span></span></span>':''}${esc(s.title)}</div><div class="song-card-artist">${esc(s.artist||'')}</div>${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}</div>`).join('');
}
function showErr(page, msg) {
    document.getElementById(page==='home'?'homeErrorText':'searchErrorText').textContent = msg;
    document.getElementById(page==='home'?'homeError':'searchError')?.classList.remove('hidden');
}

// ---------- PLAYBACK ----------
function playAt(index) {
    if (index < 0 || index >= currentQueue.length) return;
    currentIndex = index;
    playSong(currentQueue[index]);
}

async function playSong(song, retry = 0) {
    if (!song?.track_url || isLoading) return;
    currentSong = song;
    isLoading = true;

    // Update UI
    document.getElementById('playerTitle').textContent  = song.title;
    document.getElementById('playerArtist').textContent = song.artist || '';
    document.title = `${song.title} — SoundWave`;

    const cvr = document.getElementById('playerCover');
    const ph  = document.getElementById('coverPlaceholder');
    if (song.thumbnail) { cvr.src = song.thumbnail; cvr.classList.remove('hidden'); if (ph) ph.style.display = 'none'; }
    else { cvr.classList.add('hidden'); if (ph) ph.style.display = ''; }

    updateLikeBtn();
    audio.pause(); audio.src = '';
    setSpinIcon(true);

    // Show player bar
    const bar = document.getElementById('playerBar');
    const lay = document.getElementById('appLayout');
    bar?.classList.remove('hidden');
    setTimeout(() => bar?.classList.add('visible'), 10);
    lay?.classList.remove('no-player');

    // Sync NP modal if open
    if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();

    // Reset lyrics
    document.getElementById('npLyricsText')?.classList.add('hidden');
    document.getElementById('npLyricsLoading')?.classList.remove('hidden');
    document.getElementById('npLyricsError')?.classList.add('hidden');

    try {
        const r = await fetch(`/api/download?url=${encodeURIComponent(song.track_url)}`);
        const d = await r.json();
        if (!r.ok || !d.download_url) throw new Error(d.error || 'No download URL');

        audio.src = d.download_url;
        audio.load();

        // Wait for audio to be ready before playing
        await new Promise((resolve, reject) => {
            const onReady = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error('Audio load failed')); };
            const cleanup = () => {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onError);
                clearTimeout(t);
            };
            const t = setTimeout(() => { cleanup(); resolve(); /* try play anyway */ }, 6000);
            audio.addEventListener('canplay', onReady, { once: true });
            audio.addEventListener('error', onError, { once: true });
        });

        await audio.play();
        isPlaying = true; isLoading = false;
        document.getElementById('vinylDisc')?.classList.add('spinning');
        addToRecent(song);
        highlightQueue();
        if (queueOpen) renderQueuePanel();
        if (document.getElementById('npModal')?.classList.contains('open')) syncNpModal();

    } catch(e) {
        isLoading = false;
        if (e.name === 'AbortError' || e.name === 'NotAllowedError') {
            // NotAllowed = autoplay blocked, just show play button
            setSpinIcon(false); return;
        }
        // Auto retry
        if (retry < 2) {
            toast(`⏳ Retrying... (${retry+1}/2)`);
            setTimeout(() => playSong(song, retry+1), 1500);
            return;
        }
        toast('❌ Gagal load: ' + (e.message||'Error'));
        setSpinIcon(false);
        document.title = 'SoundWave — Music Player';
    }
}

function setSpinIcon(loading) {
    const ic = document.getElementById('playIcon');
    if (ic) ic.className = loading ? 'fa-solid fa-circle-notch fa-spin' : (isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play');
    updateNpPlayBtn();
}

function highlightQueue() {
    document.querySelectorAll('.song-card').forEach((c,i) => {
        const on = currentQueue[i]?.track_url === currentSong?.track_url;
        c.classList.toggle('playing', on);
        const t = c.querySelector('.song-card-title');
        if (t) t.innerHTML = (on?'<span class="playing-bars"><span></span><span></span><span></span></span>':'') + esc(currentQueue[i]?.title||'');
    });
}

// ---------- CONTROLS ----------
function togglePlayPause() { if (!audio.src) return; if (isPlaying) audio.pause(); else audio.play(); }
function updatePlayBtn() {
    const ic = document.getElementById('playIcon');
    if (ic) ic.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    document.getElementById('vinylDisc')?.classList.toggle('spinning', isPlaying);
    updateNpPlayBtn();
}
function nextSong() {
    if (!currentQueue.length) return;
    currentIndex = isShuffle ? Math.floor(Math.random()*currentQueue.length) : (currentIndex+1) % currentQueue.length;
    playAt(currentIndex);
}
function prevSong() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    currentIndex = (currentIndex-1+currentQueue.length) % currentQueue.length;
    playAt(currentIndex);
}
function toggleShuffle() {
    isShuffle = !isShuffle;
    document.getElementById('shuffleBtn')?.classList.toggle('active', isShuffle);
    document.getElementById('npShuffleBtn')?.classList.toggle('active', isShuffle);
    toast(isShuffle ? '🔀 Shuffle ON' : 'Shuffle OFF');
}
function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeatBtn')?.classList.toggle('active', isRepeat);
    document.getElementById('npRepeatBtn')?.classList.toggle('active', isRepeat);
    toast(isRepeat ? '🔁 Repeat ON' : 'Repeat OFF');
}
function toggleMute() {
    isMuted = !isMuted; audio.muted = isMuted;
    const ic = document.getElementById('volIcon');
    if (ic) ic.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    toast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
}

// ---------- AUDIO EVENTS ----------
audio.addEventListener('timeupdate', () => {
    if (!audio.duration || isDragging) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progressFill').style.width  = pct+'%';
    document.getElementById('progressThumb').style.left  = pct+'%';
    document.getElementById('timeCurrent').textContent   = fmt(audio.currentTime);
    document.getElementById('timeTotal').textContent     = fmt(audio.duration);
    document.getElementById('npBarFill').style.width     = pct+'%';
    document.getElementById('npBarThumb').style.left     = pct+'%';
    document.getElementById('npTimeCurrent').textContent = fmt(audio.currentTime);
    document.getElementById('npTimeTotal').textContent   = fmt(audio.duration);
});
audio.addEventListener('ended', () => { if (isRepeat) { audio.currentTime=0; audio.play(); } else nextSong(); });
audio.addEventListener('pause', () => { isPlaying=false; updatePlayBtn(); });
audio.addEventListener('play',  () => { isPlaying=true;  updatePlayBtn(); });
audio.addEventListener('error', () => { if (!isLoading && audio.src) { isPlaying=false; isLoading=false; updatePlayBtn(); toast('❌ Audio error — coba lagi'); } });

// ---------- DRAGS ----------
function initDrags() {
    drag('progressBar', 'progressFill', 'progressThumb', true, () => ['npBarFill','npBarThumb','timeCurrent','timeTotal','npTimeCurrent','npTimeTotal']);
    drag('npBar', 'npBarFill', 'npBarThumb', true);
    vol('volumeBar',  'volumeFill',  'npVolFill');
    vol('npVolBar',   'npVolFill',   'volumeFill');
}

function drag(barId, fillId, thumbId, isSeek) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    let active = false;
    const move = e => {
        const r   = bar.getBoundingClientRect();
        const cx  = (e.touches?.[0]||e).clientX;
        const pct = Math.max(0, Math.min(1, (cx-r.left)/r.width));
        if (isSeek && audio.duration) audio.currentTime = pct * audio.duration;
        document.getElementById(fillId).style.width = (pct*100)+'%';
        document.getElementById(thumbId).style.left = (pct*100)+'%';
        // Sync both progress bars
        if (barId === 'progressBar') { document.getElementById('npBarFill').style.width=(pct*100)+'%'; document.getElementById('npBarThumb').style.left=(pct*100)+'%'; }
        if (barId === 'npBar')       { document.getElementById('progressFill').style.width=(pct*100)+'%'; document.getElementById('progressThumb').style.left=(pct*100)+'%'; }
    };
    bar.addEventListener('mousedown', e => { active=true; isDragging=isSeek; move(e); });
    bar.addEventListener('touchstart', e => { active=true; isDragging=isSeek; move(e); }, {passive:true});
    document.addEventListener('mousemove', e => { if (active) move(e); });
    document.addEventListener('touchmove', e => { if (active) move(e); }, {passive:true});
    document.addEventListener('mouseup', () => { active=false; isDragging=false; });
    document.addEventListener('touchend', () => { active=false; isDragging=false; });
}

function vol(barId, fillId, mirrorId) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    let active = false;
    const move = e => {
        const r   = bar.getBoundingClientRect();
        const cx  = (e.touches?.[0]||e).clientX;
        const pct = Math.max(0, Math.min(1, (cx-r.left)/r.width));
        audio.volume = pct;
        document.getElementById(fillId).style.width  = (pct*100)+'%';
        document.getElementById(mirrorId).style.width = (pct*100)+'%';
        const ic = document.getElementById('volIcon');
        if (ic) ic.className = pct===0 ? 'fa-solid fa-volume-xmark' : pct<.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
    };
    bar.addEventListener('mousedown', e => { active=true; move(e); });
    bar.addEventListener('touchstart', e => { active=true; move(e); }, {passive:true});
    document.addEventListener('mousemove', e => { if (active) move(e); });
    document.addEventListener('touchmove', e => { if (active) move(e); }, {passive:true});
    document.addEventListener('mouseup', () => { active=false; });
    document.addEventListener('touchend', () => { active=false; });
}

// ---------- KEYBOARD ----------
document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const np = document.getElementById('npModal')?.classList.contains('open');
    switch(e.code) {
        case 'Space':      e.preventDefault(); if(audio.src) togglePlayPause(); break;
        case 'ArrowLeft':  e.preventDefault(); if(audio.duration) audio.currentTime=Math.max(0,audio.currentTime-5); break;
        case 'ArrowRight': e.preventDefault(); if(audio.duration) audio.currentTime=Math.min(audio.duration,audio.currentTime+5); break;
        case 'ArrowUp':    e.preventDefault(); audio.volume=Math.min(1,audio.volume+.1); syncVol(); break;
        case 'ArrowDown':  e.preventDefault(); audio.volume=Math.max(0,audio.volume-.1); syncVol(); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyL': if(currentSong) toggleLike(); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': toggleRepeat(); break;
        case 'KeyQ': toggleQueue(); break;
        case 'Escape': if(np) closeNowPlaying(); break;
    }
});
function syncVol() {
    const p = (audio.volume*100)+'%';
    document.getElementById('volumeFill').style.width = p;
    document.getElementById('npVolFill').style.width  = p;
}

// ---------- LIKED SONGS ----------
function toggleLike() {
    if (!currentSong) return;
    const i = likedSongs.findIndex(s => s.track_url===currentSong.track_url);
    if (i>=0) { likedSongs.splice(i,1); toast('💔 Dihapus dari Liked Songs'); }
    else { likedSongs.unshift({...currentSong}); toast('❤️ Ditambahkan ke Liked Songs'); }
    lsSet('sw_liked', likedSongs);
    updateLikeBtn(); updateNpLikeBtn();
}
function updateLikeBtn() {
    const btn = document.getElementById('likeBtn');
    if (!btn||!currentSong) return;
    const liked = likedSongs.some(s=>s.track_url===currentSong.track_url);
    btn.classList.toggle('liked', liked);
    btn.querySelector('i').className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}
function renderLiked() {
    const c = document.getElementById('likedList');
    const n = document.getElementById('likedCount');
    if (n) n.textContent = likedSongs.length+' lagu';
    if (!c) return;
    if (!likedSongs.length) { c.innerHTML=`<div class="empty-state"><i class="fa-regular fa-heart"></i><p>Belum ada lagu yang di-like</p><span>Tekan ❤️ waktu lagu lagi main</span></div>`; return; }
    c.innerHTML = likedSongs.map((s,i)=>`<div class="song-row ${currentSong?.track_url===s.track_url?'playing':''}" onclick="playLiked(${i})"><div class="song-row-num">${currentSong?.track_url===s.track_url?'▶':i+1}</div><img class="song-row-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1"><div class="song-row-info"><div class="song-row-title">${esc(s.title)}</div><div class="song-row-artist">${esc(s.artist||'')}</div></div>${s.duration?`<span class="song-row-duration">${s.duration}</span>`:''}<button class="song-row-unlike" onclick="event.stopPropagation();unlikeSong(${i})"><i class="fa-solid fa-heart" style="color:#f87171"></i></button></div>`).join('');
}
function playLiked(i) { currentQueue=[...likedSongs]; currentIndex=i; playAt(i); }
function unlikeSong(i) { likedSongs.splice(i,1); lsSet('sw_liked',likedSongs); renderLiked(); if(currentSong)updateLikeBtn(); toast('Dihapus'); }

// ---------- RECENT ----------
function addToRecent(song) {
    recentSongs = recentSongs.filter(s=>s.track_url!==song.track_url);
    recentSongs.unshift({...song});
    if (recentSongs.length>10) recentSongs=recentSongs.slice(0,10);
    lsSet('sw_recent', recentSongs);
    renderRecent();
}
function renderRecent() {
    const l = document.getElementById('recentList');
    if (!l) return;
    if (!recentSongs.length) { l.innerHTML='<div class="recent-empty">Belum ada lagu</div>'; return; }
    l.innerHTML = recentSongs.map((s,i)=>`<div class="recent-item" onclick="playRecent(${i})"><img class="recent-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1"><div class="recent-info"><div class="recent-title">${esc(s.title)}</div><div class="recent-artist">${esc(s.artist||'')}</div></div></div>`).join('');
}
function playRecent(i) { currentQueue=[...recentSongs]; currentIndex=i; playAt(i); }

// ---------- ARTISTS ----------
const ARTISTS = [
    {name:'Taylor Swift',   q:'Taylor Swift',   img:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png/440px-191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png'},
    {name:'The Weeknd',     q:'The Weeknd',      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/The_Weeknd_in_concert_2017.jpg/440px-The_Weeknd_in_concert_2017.jpg'},
    {name:'Billie Eilish',  q:'Billie Eilish',   img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Billie_Eilish_2019_by_Glenn_Francis.jpg/440px-Billie_Eilish_2019_by_Glenn_Francis.jpg'},
    {name:'Bruno Mars',     q:'Bruno Mars',      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Bruno_Mars_2016.jpg/440px-Bruno_Mars_2016.jpg'},
    {name:'wave to earth',  q:'wave to earth',   img:''},
    {name:'Doja Cat',       q:'Doja Cat',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Doja_Cat_at_2019_Beautycon_%28cropped%29.jpg/440px-Doja_Cat_at_2019_Beautycon_%28cropped%29.jpg'},
    {name:'Drake',          q:'Drake',           img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Drake_July_2016.jpg/440px-Drake_July_2016.jpg'},
    {name:'SZA',            q:'SZA',             img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/SZA_2017.jpg/440px-SZA_2017.jpg'},
    {name:'Harry Styles',   q:'Harry Styles',    img:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Harry_Styles_2014.jpg/440px-Harry_Styles_2014.jpg'},
    {name:'Olivia Rodrigo', q:'Olivia Rodrigo',  img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Olivia_Rodrigo_2021.png/440px-Olivia_Rodrigo_2021.png'},
];
function nameColor(n) {
    const cols=['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];
    let h=0; for(const c of n) h=n.charCodeAt(0)+((h<<5)-h);
    return cols[Math.abs(h)%cols.length];
}
function renderArtists() {
    const r = document.getElementById('artistRow');
    if (!r) return;
    r.innerHTML = ARTISTS.map(a => {
        const init=a.name[0].toUpperCase(), col=nameColor(a.name);
        return `<div class="artist-chip" onclick="searchArtist('${esc(a.q)}')"><div class="artist-avatar-wrap">${a.img?`<img class="artist-avatar-img" src="${a.img}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="${esc(a.name)}"><div class="artist-avatar-init" style="display:none;background:linear-gradient(135deg,${col},${col}99)">${init}</div>`:`<div class="artist-avatar-init" style="background:linear-gradient(135deg,${col},${col}99)">${init}</div>`}</div><span class="artist-name">${esc(a.name)}</span></div>`;
    }).join('');
}
function searchArtist(q) { document.getElementById('searchInputHome').value=q; doSearch('home'); }

// ---------- RECOMMENDATIONS (infinite scroll + dedup) ----------
const REC_QUERIES = [
    'Blinding Lights The Weeknd','As It Was Harry Styles','Flowers Miley Cyrus',
    'Anti-Hero Taylor Swift','golden hour kacey musgraves','Die For You The Weeknd',
    'Calm Down Rema','Stay Kid Laroi','Heat Waves Glass Animals','Levitating Dua Lipa',
    'Peaches Justin Bieber','Kiss Me More Doja Cat','Good 4 U Olivia Rodrigo',
    'Shivers Ed Sheeran','Bad Habits Ed Sheeran','Butter BTS','Easy Troye Sivan',
    'Rush Troye Sivan','Break My Soul Beyonce','Cuff It Beyonce',
    'Running Up That Hill Kate Bush','Enemy Imagine Dragons','Rich Flex Drake',
    'Superhero Metro Boomin','Unholy Sam Smith','Ghost Justin Bieber',
    'Cruel Summer Taylor Swift','All Too Well Taylor Swift','telepatia kali uchis',
    'Watermelon Sugar Harry Styles','Adore You Harry Styles','Dynamite BTS',
    'Ditto NewJeans','Hype Boy NewJeans','OMG NewJeans','Attention NewJeans',
    'Attention Charlie Puth','See You Again Wiz Khalifa','After Hours The Weeknd',
    'Starboy The Weeknd','Save Your Tears The Weeknd','Midnight Rain Taylor Swift',
    'Bejeweled Taylor Swift','Drivers License Olivia Rodrigo','traitor Olivia Rodrigo',
    'brutal Olivia Rodrigo','Despacito Luis Fonsi','Lean On Major Lazer',
    'Cheap Thrills Sia','Chandelier Sia','Electric Love Borns',
    'Unstoppable Sia','Silk Sonic Leave The Door Open','Skate Bruno Mars',
];

let recLoading = false;
let recUsed    = new Set();
let recSongs   = [];

async function loadRecommendations(append=false) {
    if (recLoading) return;
    recLoading = true;
    const skel = document.getElementById('recommendSkeleton');
    const grid = document.getElementById('recommendGrid');
    if (!grid) { recLoading=false; return; }
    if (!append && skel) skel.classList.remove('hidden');

    const pool = REC_QUERIES.filter(q=>!recUsed.has(q));
    if (!pool.length) recUsed.clear();
    const q = (pool.length ? pool : REC_QUERIES)[Math.floor(Math.random()*(pool.length||REC_QUERIES.length))];
    recUsed.add(q);

    try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (skel) skel.classList.add('hidden');
        if (d.results?.length) {
            const fresh = d.results.filter(s=>!recSongs.some(x=>x.track_url===s.track_url));
            if (!fresh.length) { recLoading=false; return loadRecommendations(append); }
            const start = recSongs.length;
            recSongs = [...recSongs, ...fresh];
            grid.classList.remove('hidden');
            grid._songs = recSongs;
            if (!append) {
                grid.innerHTML = fresh.map((s,i)=>recCard(s, start+i)).join('');
            } else {
                fresh.forEach((s,i)=>{ const d=document.createElement('div'); d.innerHTML=recCard(s,start+i); grid.appendChild(d.firstElementChild); });
            }
        }
    } catch { if (skel) skel.classList.add('hidden'); }
    recLoading=false;
}
function recCard(s,i) {
    return `<div class="song-card" onclick="playRec(${i})"><div style="position:relative"><img class="song-card-cover" src="${s.thumbnail||''}" onerror="this.style.opacity=.1"><div class="song-card-overlay"><div class="song-card-play-icon"><i class="fa-solid fa-play"></i></div></div></div><div class="song-card-title">${esc(s.title)}</div><div class="song-card-artist">${esc(s.artist||'')}</div>${s.duration?`<div class="song-card-duration">${s.duration}</div>`:''}</div>`;
}
function playRec(i) {
    const g = document.getElementById('recommendGrid');
    if (!g?._songs) return;
    currentQueue=[...g._songs]; currentIndex=i; playAt(i);
}
function initInfiniteScroll() {
    const mc = document.getElementById('mainContent');
    if (!mc) return;
    mc.addEventListener('scroll', () => {
        if (!document.getElementById('page-home')?.classList.contains('active')) return;
        if (mc.scrollHeight-mc.scrollTop-mc.clientHeight < 300 && !recLoading) loadRecommendations(true);
    });
}

// ---------- UTILS ----------
function fmt(s) { if(!s||isNaN(s)) return '0:00'; return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function cap(s) { return s[0].toUpperCase()+s.slice(1); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let toastT;
function toast(msg) {
    const el=document.getElementById('toast');
    if(!el) return;
    el.textContent=msg; el.classList.remove('hidden'); el.classList.add('show');
    clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),2800);
}

// Reveal animation
const obs = new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
