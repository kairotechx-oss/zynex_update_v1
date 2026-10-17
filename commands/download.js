import { ytmp3, ytmp4 } from 'ruhend-scraper';
import yts from 'yt-search';
import fetch from 'node-fetch';
import axios from 'axios';

// ─── .song / .play / .mp3 / .ytmp3 / .music / .audio ───────────────────────
export async function song(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, { text: '❌ Provide a song name or YouTube link.\nEx: .play Faded Alan Walker' }, { quoted: message });
    }

    try {
        let videoUrl = query;
        let fallbackTitle = null;

        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            const search = await yts(query);
            const video = search?.videos?.[0];
            if (!video) {
                return client.sendMessage(remoteJid, { text: '❌ No results found.' }, { quoted: message });
            }
            videoUrl = video.url;
            fallbackTitle = video.title;
        }

        let dlUrl = null;
        let title = fallbackTitle || 'song';

        // Source 1: GiftedTech
        try {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
            const d = res.data?.result;
            if (d?.download_url) {
                dlUrl = d.download_url;
                title = d.title || title;
            }
        } catch (e) {
            console.log('GiftedTech ytmp3 failed, trying apis-keith:', e.message);
        }

        // Source 2: apis-keith
        if (!dlUrl) {
            try {
                const res = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 30000 });
                const d = res.data;
                if (d?.status && d?.result?.downloadUrl) {
                    dlUrl = d.result.downloadUrl;
                    title = d.result.title || title;
                }
            } catch (e) {
                console.log('apis-keith failed, trying ruhend-scraper:', e.message);
            }
        }

        // Source 3: ruhend-scraper
        if (!dlUrl) {
            try {
                const data = await ytmp3(videoUrl);
                dlUrl = data?.audio || data?.url || data?.download;
                title = data?.title || title;
            } catch (e) {
                console.log('ruhend-scraper ytmp3 also failed:', e.message);
            }
        }

        if (!dlUrl) {
            return client.sendMessage(remoteJid, { text: '❌ Audio not generated. All sources failed.' }, { quoted: message });
        }

        await client.sendMessage(remoteJid, {
            audio: { url: dlUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${title}.mp3`
        }, { quoted: message });

        await client.sendMessage(remoteJid, {
            text: `🎵 *${title}*\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (err) {
        console.error('SONG ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Something went wrong, try again later.' }, { quoted: message });
    }
}

// ─── .video1 / .vid / .ytv ──────────────────────────────────────────────────
export async function video1(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, { text: '❌ Provide a YouTube link or search query.\nEx: .video1 Pasoori' }, { quoted: message });
    }

    try {
        let videoUrl = query;

        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            const search = await yts(query);
            const video = search?.videos?.[0];
            if (!video) return client.sendMessage(remoteJid, { text: '❌ No results found.' }, { quoted: message });
            videoUrl = video.url;
        }

        const data = await ytmp4(videoUrl);
        const finalUrl = data?.video || data?.url || data?.download;

        if (!finalUrl) {
            return client.sendMessage(remoteJid, { text: '❌ No downloadable video found.' }, { quoted: message });
        }

        await client.sendMessage(remoteJid, {
            video: { url: finalUrl },
            caption: `*${data?.title || 'Video'}*\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (err) {
        console.error('VIDEO1 ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Error while fetching video.' }, { quoted: message });
    }
}

// ─── .apk ────────────────────────────────────────────────────────────────
export async function apk(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, { text: '📦 *USAGE:* .apk <app name>' }, { quoted: message });
    }

    try {
        const apiUrl = `http://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        const app = data?.datalist?.list?.[0];
        if (!app) {
            return client.sendMessage(remoteJid, { text: '❌ No APK found.' }, { quoted: message });
        }

        const appSize = (app.size / 1048576).toFixed(2);
        const caption = `┏━━ ✦ *APK INFO* ✦ ━━┓\n┃ 📱 Name    : *${app.name}*\n┃ 📦 Size    : *${appSize} MB*\n┃ 🧩 Package : *${app.package}*\n┃ 🔖 Version : *${app.file.vername}*\n┗━━━━━━━━━━━━━━━━━━┛\n\n*Powered by: KAIRO ZYNEX*`;

        await client.sendMessage(remoteJid, { image: { url: app.icon }, caption }, { quoted: message });

        await client.sendMessage(remoteJid, {
            document: { url: app.file.path || app.file.path_alt },
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${app.name}.apk`
        }, { quoted: message });

    } catch (err) {
        console.error('APK ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Error, try again.' }, { quoted: message });
    }
}

export default { song, video1, apk };
