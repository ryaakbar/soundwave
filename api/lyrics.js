import axios from "axios";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();

    const { artist, title } = req.query;
    if (!artist || !title) return res.status(400).json({ error: "artist & title required" });

    const clean = (s) => s.replace(/\(.*?\)|\[.*?\]/g, '').replace(/[-–].*$/, '').trim();
    const cleanTitle = clean(title);
    const cleanArtist = clean(artist);

    // Try lyrics.ovh first (free, no auth)
    try {
        const r = await axios.get(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
            { timeout: 8000 }
        );
        if (r.data?.lyrics) {
            return res.status(200).json({ lyrics: r.data.lyrics.trim(), source: "lyrics.ovh" });
        }
    } catch (e) {}

    // Try lrclib.net (has synced lyrics too)
    try {
        const r = await axios.get("https://lrclib.net/api/search", {
            params: { q: `${cleanArtist} ${cleanTitle}` },
            timeout: 8000
        });
        const item = r.data?.[0];
        if (item?.plainLyrics) {
            return res.status(200).json({ lyrics: item.plainLyrics.trim(), source: "lrclib" });
        }
        if (item?.syncedLyrics) {
            // Strip timestamps from synced lyrics
            const plain = item.syncedLyrics
                .split('\n')
                .map(l => l.replace(/^\[\d+:\d+\.\d+\]\s*/, ''))
                .filter(Boolean)
                .join('\n');
            return res.status(200).json({ lyrics: plain, source: "lrclib" });
        }
    } catch (e) {}

    return res.status(404).json({ error: "Lyrics not found" });
}
