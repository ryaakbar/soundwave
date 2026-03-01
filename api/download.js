import axios from "axios";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { url } = req.query;
    if (!url || !url.trim()) return res.status(400).json({ error: "URL required" });

    try {
        const response = await axios.get("https://api.danzy.web.id/api/download/spotify", {
            params: { url: url.trim() },
            timeout: 35000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });

        const data = response.data?.result || response.data?.data || response.data;

        const downloadUrl = data?.download_url
            || data?.audio_url
            || data?.url
            || data?.link
            || data?.mp3_url
            || null;

        if (!downloadUrl) {
            console.error("[download] No URL in response:", JSON.stringify(response.data).slice(0, 200));
            return res.status(502).json({ error: "API tidak return download URL" });
        }

        return res.status(200).json({
            download_url: downloadUrl,
            title:    data?.title || "",
            artist:   data?.artist || data?.artists || "",
            image:    data?.image || data?.thumbnail || data?.cover || "",
            duration: data?.duration || ""
        });

    } catch (error) {
        console.error("[download] Error:", error.message);
        if (error.code === "ECONNABORTED") return res.status(504).json({ error: "Download timeout. Coba lagi." });
        if (error.response?.status === 404) return res.status(404).json({ error: "Lagu tidak ditemukan." });
        if (error.response?.status === 429) return res.status(429).json({ error: "Rate limited. Tunggu sebentar." });
        return res.status(500).json({ error: "Download gagal: " + (error.message || "Unknown error") });
    }
}
