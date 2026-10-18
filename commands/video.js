import axios from 'axios';
import yts from 'yt-search';

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

const YT_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|v\/|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastError;
}

// ─── download sources (tried in order) ──────────────────────────────────────
async function getEliteProTechVideoByUrl(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
        return { download: res.data.downloadURL, title: res.data.title };
    }
    throw new Error('EliteProTech returned no download');
}

async function getYupraVideoByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return { download: res.data.data.download_url, title: res.data.data.title, thumbnail: res.data.data.thumbnail };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu returned no mp4');
}

async function downloadBuffer(url) {
    const res = await axios.get(url, {
        ...AXIOS_DEFAULTS,
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: 120 * 1024 * 1024,
        maxBodyLength: 120 * 1024 * 1024
    });
    return Buffer.from(res.data);
}

// ─── .video / .ytmp4 <name or youtube link> ─────────────────────────────────
export async function video(message, client, searchQuery) {
    const remoteJid = message.key.remoteJid;
    const q = { quoted: message };
    searchQuery = (searchQuery || '').trim();

    if (!searchQuery) {
        return client.sendMessage(remoteJid, { text: '🎬 What video do you want to download?\nExample: .video faded alan walker' }, q);
    }

    try {
        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

        if (/^https?:\/\//i.test(searchQuery)) {
            videoUrl = searchQuery;
            if (!YT_REGEX.test(videoUrl)) {
                return client.sendMessage(remoteJid, { text: '❌ This is not a valid YouTube link!' }, q);
            }
        } else {
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                return client.sendMessage(remoteJid, { text: '❌ No videos found!' }, q);
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        // Thumbnail + "Downloading..." (never blocks the download if it fails)
        try {
            const ytId = (videoUrl.match(YT_REGEX) || [])[1];
            const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
            if (thumb) {
                await client.sendMessage(remoteJid, {
                    image: { url: thumb },
                    caption: `*${videoTitle || searchQuery}*\n⏳ Downloading...`
                }, q);
            }
        } catch (e) { console.error('[VIDEO] thumb error:', e?.message || e); }

        const apiMethods = [
            { name: 'EliteProTech', method: () => getEliteProTechVideoByUrl(videoUrl) },
            { name: 'Yupra', method: () => getYupraVideoByUrl(videoUrl) },
            { name: 'Okatsu', method: () => getOkatsuVideoByUrl(videoUrl) }
        ];

        let videoData = null;
        for (const api of apiMethods) {
            try {
                const data = await api.method();
                if (data?.download) { videoData = data; break; }
            } catch (apiErr) {
                console.log(`[VIDEO] ${api.name} failed:`, apiErr.message);
            }
        }

        if (!videoData) {
            throw new Error('All download sources failed. The content may be unavailable or blocked.');
        }

        const title = videoData.title || videoTitle || 'Video';
        const payload = {
            mimetype: 'video/mp4',
            fileName: `${title.replace(/[^\w\s-]/g, '').trim() || 'video'}.mp4`,
            caption: `*${title}*\n\n> *Powered by KAIRO ZYNEX*`
        };

        // Try sending by URL first; if WhatsApp can't fetch it, download the file ourselves.
        try {
            await client.sendMessage(remoteJid, { video: { url: videoData.download }, ...payload }, q);
        } catch (sendErr) {
            console.log('[VIDEO] send by URL failed, retrying with buffer:', sendErr?.message || sendErr);
            const buffer = await downloadBuffer(videoData.download);
            await client.sendMessage(remoteJid, { video: buffer, ...payload }, q);
        }

    } catch (error) {
        console.error('[VIDEO] Command Error:', error?.message || error);

        let errorMessage = '❌ Failed to download video.';
        if (error.response?.status === 451 || error.status === 451) {
            errorMessage = '❌ Content unavailable (451). Legal restriction or regional blocking.';
        } else if (error.message?.includes('All download sources failed')) {
            errorMessage = '❌ All download sources failed. Try again later or try another video.';
        } else if (error.message) {
            errorMessage = '❌ Download failed: ' + error.message;
        }

        await client.sendMessage(remoteJid, { text: errorMessage }, q);
    }
}

export default { video };
