import { ytmp3 as vredenYtmp3 } from '@vreden/youtube_scraper';
import { ytmp4 } from 'ruhend-scraper';
import yts from 'yt-search';
import fetch from 'node-fetch';
import axios from 'axios';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── .song / .play / .mp3 / .ytmp3 / .music / .audio ───────────────────────
export async function song(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, {
            text: '❌ Provide a song name.\nEx: .play Faded Alan Walker'
        }, { quoted: message });
    }

    try { await client.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } }); } catch {}

    let search;
    try {
        search = await yts(query);
    } catch (searchErr) {
        try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
        return client.sendMessage(remoteJid, { text: '❌ Search failed.' }, { quoted: message });
    }

    if (!search.videos?.length) {
        try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
        return client.sendMessage(remoteJid, { text: '❌ Song not found.' }, { quoted: message });
    }

    const video = search.videos[0];
    let data;

    // Primary: @vreden/youtube_scraper, retried once.
    try {
        data = await vredenYtmp3(video.url);
    } catch (e1) {
        await sleep(2500);
        try {
            data = await vredenYtmp3(video.url);
        } catch (e2) {
            data = null;
        }
    }

    let dlUrl = data?.status && data?.download?.url ? data.download.url : null;
    let title = data?.metadata?.title || video.title;
    let author = data?.metadata?.author?.name || video.author?.name;
    let durSec = data?.metadata?.duration?.seconds ?? data?.metadata?.seconds ?? 0;
    let thumb = data?.metadata?.thumbnail || video.thumbnail;

    // Fallback: apis-keith, if the primary source failed.
    if (!dlUrl) {
        try {
            const res = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(video.url)}`, { timeout: 30000 });
            const d = res.data;
            if (d?.status && d?.result?.downloadUrl) {
                dlUrl = d.result.downloadUrl;
                title = d.result.title || title;
            }
        } catch (e) {
            console.log('apis-keith fallback failed:', e.message);
        }
    }

    if (!dlUrl) {
        try { await client.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch {}
        return client.sendMessage(remoteJid, { text: '❌ Failed to fetch music. All sources failed.' }, { quoted: message });
    }

    const minutes = Math.floor(durSec / 60);
    const seconds = (durSec % 60).toString().padStart(2, '0');
    const durationStr = durSec ? `${minutes}:${seconds}` : 'N/A';

    const caption =
        `╭───「 🎵 *KAIRO ZYNEX AUDIO* 」───\n` +
        `│ 📌 *Title:* ${title}\n` +
        `│ 👤 *Author:* ${author || 'Unknown'}\n` +
        `│ ⏱️ *Duration:* ${durationStr}\n` +
        `╰─────────────────────────☉\n` +
        `> *Powered by: KAIRO ZYNEX*`;

    if (thumb) {
        await client.sendMessage(remoteJid, { image: { url: thumb }, caption }, { quoted: message });
    }

    await client.sendMessage(remoteJid, {
        audio: { url: dlUrl },
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${title}.mp3`
    }, { quoted: message });

    try { await client.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch {}
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
