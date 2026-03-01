import axios from "axios";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { q } = req.query;
    if (!q || !q.trim()) return res.status(400).json({ error: "Query required" });

    try {
        const response = await axios.get("https://api.danzy.web.id/api/search/spotify", {
            params: { q: q.trim() },
            timeout: 12000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });

        const raw = response.data?.result
            || response.data?.data
            || response.data?.results
            || [];

        if (!Array.isArray(raw) || raw.length === 0) {
            return res.status(200).json({ results: [] });
        }

        const results = raw.map(item => ({
            title:     item.title || item.name || item.track_name || "Unknown",
            artist:    item.artist || item.artists || item.artist_name || "",
            thumbnail: item.thumbnail || item.image || item.cover || item.artwork || "",
            track_url: item.track_url || item.url || item.spotify_url || item.link || "",
            duration:  fmtDuration(item.duration || item.duration_ms)
        })).filter(s => s.track_url);

        return res.status(200).json({ results });

    } catch (error) {
        console.error("[search] Error:", error.message);
        if (error.code === "ECONNABORTED") return res.status(504).json({ error: "API timeout. Coba lagi." });
        if (error.response?.status === 429) return res.status(429).json({ error: "Rate limited. Tunggu sebentar." });
        return res.status(500).json({ error: "Search gagal: " + (error.message || "Unknown error") });
    }
}

function fmtDuration(val) {
    if (!val) return "";
    if (typeof val === "string" && val.includes(":")) return val;
    const ms = parseInt(val);
    if (isNaN(ms)) return "";
    const totalSec = Math.floor(ms > 10000 ? ms / 1000 : ms);
    const m = Math.floor(totalSec / 60);
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
}
