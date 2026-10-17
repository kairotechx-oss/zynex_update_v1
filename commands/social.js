import axios from 'axios';
import { igdl, ttdl } from 'ruhend-scraper';

const processedMessages = new Set();

function extractUniqueMedia(mediaData) {
    const uniqueMedia = [];
    const seenUrls = new Set();
    for (const media of mediaData) {
        if (!media.url) continue;
        if (!seenUrls.has(media.url)) {
            seenUrls.add(media.url);
            uniqueMedia.push(media);
        }
    }
    return uniqueMedia;
}

// ─── .tiktok <link> ─────────────────────────────────────────────────────────
export async function tiktok(message, client, input) {
    const remoteJid = message.key.remoteJid;
    const url = (input || '').trim();

    if (!url || (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com'))) {
        return client.sendMessage(remoteJid, {
            text: '📱 *Usage:* .tiktok https://vt.tiktok.com/...'
        }, { quoted: message });
    }

    try { await client.sendMessage(remoteJid, { react: { text: '🔄', key: message.key } }); } catch {}

    let videoUrl = null;
    let title = 'TikTok Video';
    let author = null;

    // Source 1: Tikwm
    try {
        const res = await axios.post('https://www.tikwm.com/api/', { url }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            timeout: 15000
        });
        if (res.data?.data) {
            const d = res.data.data;
            videoUrl = d.play || d.wmplay;
            title = d.title || title;
            author = d.author?.nickname || null;
        }
    } catch (e) {
        console.log('Tikwm failed, trying GiftedTech:', e.message);
    }

    // Source 2: GiftedTech
    if (!videoUrl) {
        try {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/tiktok?apikey=gifted&url=${encodeURIComponent(url)}`, { timeout: 15000 });
            if (res.data?.result) {
                const d = res.data.result;
                videoUrl = d.video || d.hdvideo || d.nowm;
                title = d.title || title;
                author = d.author || author;
            }
        } catch (e) {
            console.log('GiftedTech failed, trying Siputzx:', e.message);
        }
    }

    // Source 3: Siputzx
    if (!videoUrl) {
        try {
            const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: { accept: '*/*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (response.data?.status && response.data.data) {
                const d = response.data.data;
                videoUrl = (d.urls && d.urls[0]) || d.video_url || d.url || d.download_url;
                title = d.metadata?.title || title;
            }
        } catch (e) {
            console.log('Siputzx failed, trying ttdl fallback:', e.message);
        }
    }

    // Source 4: ttdl (ruhend-scraper)
    if (!videoUrl) {
        try {
            const downloadData = await ttdl(url);
            if (downloadData?.data?.length > 0) {
                const uniqueMedia = extractUniqueMedia(downloadData.data);
                for (let i = 0; i < Math.min(20, uniqueMedia.length); i++) {
                    const media = uniqueMedia[i];
                    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(media.url) || media.type === 'video';
                    if (isVideo) {
                        await client.sendMessage(remoteJid, { video: { url: media.url }, mimetype: 'video/mp4', caption: '*Powered by: KAIRO ZYNEX*' }, { quoted: message });
                    } else {
                        await client.sendMessage(remoteJid, { image: { url: media.url }, caption: '*Powered by: KAIRO ZYNEX*' }, { quoted: message });
                    }
                }
                return;
            }
        } catch (e) {
            console.log('ttdl also failed:', e.message);
        }
    }

    if (!videoUrl) {
        return client.sendMessage(remoteJid, {
            text: '❌ Could not get that TikTok video from any source. It may be private or removed.'
        }, { quoted: message });
    }

    const caption = `╭───「 📱 *TIKTOK DOWNLOAD* 」───\n│ 📌 *Title:* ${title}\n${author ? `│ 👤 *Creator:* ${author}\n` : ''}╰─────────────────────────☉\n> *Powered by: KAIRO ZYNEX*`;

    await client.sendMessage(remoteJid, { video: { url: videoUrl }, mimetype: 'video/mp4', caption }, { quoted: message });
}

// ─── .ig / .instagram <link> ────────────────────────────────────────────────
export async function instagram(message, client, urlArg) {
    const remoteJid = message.key.remoteJid;

    try {
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        const text = (urlArg || '').trim();

        if (!text) {
            return client.sendMessage(remoteJid, { text: '❌ Give me an Instagram link (post, reel or video).' }, { quoted: message });
        }

        const instagramPatterns = [
            /https?:\/\/(?:www\.)?instagram\.com\//,
            /https?:\/\/(?:www\.)?instagr\.am\//,
            /https?:\/\/(?:www\.)?instagram\.com\/p\//,
            /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
            /https?:\/\/(?:www\.)?instagram\.com\/tv\//
        ];
        const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));

        if (!isValidUrl) {
            return client.sendMessage(remoteJid, { text: '❌ That is not a valid Instagram link (post, reel or video).' }, { quoted: message });
        }

        try { await client.sendMessage(remoteJid, { react: { text: '🔄', key: message.key } }); } catch {}

        const downloadData = await igdl(text);

        if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
            try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
            return client.sendMessage(remoteJid, { text: '❌ No media found. The post may be private or the link invalid.' }, { quoted: message });
        }

        const uniqueMedia = extractUniqueMedia(downloadData.data);
        const mediaToDownload = uniqueMedia.slice(0, 20);

        if (mediaToDownload.length === 0) {
            try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
            return client.sendMessage(remoteJid, { text: '❌ No valid media to download.' }, { quoted: message });
        }

        for (let i = 0; i < mediaToDownload.length; i++) {
            try {
                const media = mediaToDownload[i];
                const mediaUrl = media.url;
                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) ||
                    media.type === 'video' || text.includes('/reel/') || text.includes('/tv/');

                if (isVideo) {
                    await client.sendMessage(remoteJid, { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: '> *Powered by: KAIRO ZYNEX*' }, { quoted: message });
                } else {
                    await client.sendMessage(remoteJid, { image: { url: mediaUrl }, caption: '> *Powered by: KAIRO ZYNEX*' }, { quoted: message });
                }

                if (i < mediaToDownload.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (mediaError) {
                console.error(`Error downloading media ${i + 1}:`, mediaError);
            }
        }

        try { await client.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch {}

    } catch (error) {
        console.error('Error in Instagram command:', error);
        try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
        await client.sendMessage(remoteJid, { text: '❌ An error occurred while processing the Instagram request.' }, { quoted: message });
    }
}

export default { tiktok, instagram };
