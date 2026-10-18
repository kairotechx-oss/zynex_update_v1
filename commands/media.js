import fs from 'fs'
import path from 'path'
import { exec, execFile } from 'child_process'

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker } from 'wa-sticker-formatter';

// ffmpeg: use the bundled binary (ffmpeg-static) when the host has no system ffmpeg
let FFMPEG = 'ffmpeg';
try {
    const mod = await import('ffmpeg-static');
    if (mod?.default) { FFMPEG = mod.default; process.env.FFMPEG_PATH = FFMPEG; }
} catch {}


export async function photo(message, client) {

    try {

        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        const target = quoted?.stickerMessage;

        if (!target) return await client.sendMessage(message.key.remoteJid, { text: "No sticker found." })

        const buffer = await downloadMediaMessage({ message: quoted, client }, "buffer");

        const filename = `./temp/sticker-${Date.now()}.png`

        if (!fs.existsSync('./temp')) fs.mkdirSync('./temp')

        fs.writeFileSync(filename, buffer)

        await client.sendMessage(message.key.remoteJid, { image: fs.readFileSync(filename), caption: "> *POWERED BY KAIRO ZYNEX*" })

        fs.unlinkSync(filename)

    } catch (e) {

        console.log(e)

        await client.sendMessage(message.key.remoteJid, { text: "*❌ 𝙴𝚁𝚁𝙾𝚁 𝚃𝙾 𝙲𝙾𝙽𝚅𝙴𝚁𝚃𝙸𝙽𝙶 𝚂𝚃𝙸𝙲𝙺𝙴𝚁 𝚃𝙾 𝙸𝙼𝙰𝙶𝙴.*" })
    }
}

export async function tomp3(message, client) {

    const remoteJid = message.key.remoteJid;
    const rawQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quoted = unwrapMessage(rawQuoted);
    const own = unwrapMessage(message.message);

    const source = quoted?.videoMessage || quoted?.audioMessage ||
        (!quoted && (own?.videoMessage || own?.audioMessage));

    if (!source) {
        return client.sendMessage(remoteJid, { text: '❌ *Reply to a video with .toaudio*' }, { quoted: message });
    }

    const stamp = Date.now();
    const tmpDir = './temp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const inputPath = `${tmpDir}/video-${stamp}.mp4`;
    const outputPath = `${tmpDir}/audio-${stamp}.mp3`;

    try {
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        const wrapped = quoted
            ? { key: { remoteJid, id: ctx?.stanzaId, participant: ctx?.participant, fromMe: false }, message: quoted }
            : { key: message.key, message: own };

        const buffer = await downloadMediaMessage(wrapped, 'buffer', {}, { reuploadRequest: client.updateMediaMessage });
        if (!buffer || !buffer.length) throw new Error('Could not download the media');

        fs.writeFileSync(inputPath, buffer);

        await runFfmpeg(['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-ar', '44100', outputPath]);

        await client.sendMessage(remoteJid, {
            audio: fs.readFileSync(outputPath),
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: message });

    } catch (e) {
        console.error('toaudio:', e);
        await client.sendMessage(remoteJid, { text: `*❌ 𝙴𝚁𝚁𝙾𝚁 𝚃𝙾 𝙲𝙾𝙽𝚅𝙴𝚁𝚃𝙸𝙽𝙶 𝚅𝙸𝙳𝙴𝙾 𝚃𝙾 𝙰𝚄𝙳𝙸𝙾: ${e.message}*` }, { quoted: message });
    } finally {
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
    }
}

// ─── .sticker (image, video, gif) ───────────────────────────────────────────
function unwrapMessage(m) {
    let cur = m;
    for (let i = 0; i < 5 && cur; i++) {
        const inner = cur.ephemeralMessage?.message ||
            cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message ||
            cur.viewOnceMessageV2Extension?.message ||
            cur.documentWithCaptionMessage?.message;
        if (!inner) break;
        cur = inner;
    }
    return cur;
}

function runFfmpeg(args, timeout = 90000) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG, args, { timeout, maxBuffer: 1024 * 1024 * 10 }, (err, _out, stderr) => {
            if (err) return reject(new Error(`ffmpeg: ${(stderr || err.message).toString().split('\n').slice(-3).join(' ').trim()}`));
            resolve();
        });
    });
}

// Video/GIF -> animated WebP (512x512, max 8s, kept under ~900 KB for WhatsApp)
async function videoToWebp(inputPath, outputPath) {
    const vf = 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=black@0,format=rgba';
    const attempts = [
        { q: 45, t: 8 },
        { q: 30, t: 8 },
        { q: 20, t: 6 },
        { q: 12, t: 5 }
    ];
    let lastSize = 0;
    for (const { q, t } of attempts) {
        await runFfmpeg([
            '-y', '-i', inputPath, '-t', String(t), '-an', '-vf', vf,
            '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '4',
            '-q:v', String(q), '-loop', '0', '-preset', 'default',
            '-threads', '2', outputPath
        ]);
        lastSize = fs.statSync(outputPath).size;
        if (lastSize <= 900 * 1024) return;
    }
    throw new Error(`Video too heavy for a sticker (${Math.round(lastSize / 1024)} KB). Try a shorter video.`);
}

// Writes WhatsApp pack/author metadata straight into a WebP (no extra library needed)
function addWebpExif(webp, pack, author) {
    if (webp.length < 30 || webp.toString('ascii', 12, 16) !== 'VP8X') return webp;
    const json = Buffer.from(JSON.stringify({
        'sticker-pack-id': `kairo-zynex-${Date.now()}`,
        'sticker-pack-name': pack,
        'sticker-pack-publisher': author,
        emojis: ['😀']
    }), 'utf-8');
    const header = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const exif = Buffer.concat([header, json]);
    exif.writeUIntLE(json.length, 14, 4);
    const chunkHead = Buffer.alloc(8);
    chunkHead.write('EXIF', 0, 'ascii');
    chunkHead.writeUInt32LE(exif.length, 4);
    const pad = exif.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
    const out = Buffer.concat([webp, chunkHead, exif, pad]);
    out[20] |= 0x08; // VP8X flags: EXIF present
    out.writeUInt32LE(out.length - 8, 4);
    return out;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

export async function sticker(message, client) {
    const remoteJid = message.key.remoteJid;
    const rawQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quoted = unwrapMessage(rawQuoted);
    const own = unwrapMessage(message.message);

    const imageSrc = quoted?.imageMessage || (!quoted && own?.imageMessage);
    const videoSrc = quoted?.videoMessage || (!quoted && own?.videoMessage);
    const docSrc = (quoted?.documentMessage || (!quoted && own?.documentMessage));
    const docIsVideo = docSrc?.mimetype?.startsWith('video/');
    const docIsImage = docSrc?.mimetype?.startsWith('image/');

    const isVideo = !!videoSrc || !!docIsVideo;
    const isImage = !!imageSrc || !!docIsImage;

    if (!isVideo && !isImage) {
        return client.sendMessage(remoteJid, { text: '❌ *Reply to an image/video/gif with .sticker*' }, { quoted: message });
    }

    const wrapped = { key: message.key, message: quoted ? quoted : own };
    if (quoted) {
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        wrapped.key = { remoteJid, id: ctx?.stanzaId, participant: ctx?.participant, fromMe: false };
    }

    const stamp = Date.now();
    const tmpDir = './temp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const inPath = `${tmpDir}/stk-in-${stamp}.mp4`;
    const outPath = `${tmpDir}/stk-out-${stamp}.webp`;

    try {
        const buffer = await downloadMediaMessage(wrapped, 'buffer', {}, { reuploadRequest: client.updateMediaMessage });
        if (!buffer || !buffer.length) throw new Error('Could not download the media');

        // ── Image: unchanged behaviour ──
        if (!isVideo) {
            const st = new Sticker(buffer, { pack: 'KAIRO ZYNEX', author: 'KAIRO ZYNEX', type: 'default', quality: 70 });
            return await client.sendMessage(remoteJid, { sticker: await st.toBuffer() }, { quoted: message });
        }

        // ── Video / GIF: convert with ffmpeg first, then add pack/author metadata ──
        fs.writeFileSync(inPath, buffer);
        await videoToWebp(inPath, outPath);
        const webp = fs.readFileSync(outPath);

        let finalSticker = webp;
        try { finalSticker = addWebpExif(webp, 'KAIRO ZYNEX', 'KAIRO ZYNEX'); }
        catch (metaErr) { console.log('sticker metadata skipped:', metaErr.message); }

        await client.sendMessage(remoteJid, { sticker: finalSticker }, { quoted: message });
    } catch (e) {
        console.error('sticker:', e);
        await client.sendMessage(remoteJid, { text: `*❌ STICKER ERROR: ${e.message}*` }, { quoted: message });
    } finally {
        try { fs.unlinkSync(inPath); } catch {}
        try { fs.unlinkSync(outPath); } catch {}
    }
}

export async function getProfilePicture(message, client) {
    const jid = message.message?.extendedTextMessage?.contextInfo?.participant || message.key.remoteJid;
    try {
        const url = await client.profilePictureUrl(jid, 'image');
        await client.sendMessage(message.key.remoteJid, { image: { url }, caption: '*🖼️ 𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴*' }, { quoted: message });
    } catch {
        await client.sendMessage(message.key.remoteJid, { text: '*❌ 𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴 𝙽𝙾𝚃 𝙰𝚅𝙰𝙸𝙻𝙰𝙱𝙻𝙴.*' }, { quoted: message });
    }
}

export async function setProfilePicture(message, client) {
    const remoteJid = message.key.remoteJid;
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const source = quoted?.imageMessage || message.message?.imageMessage;
    const wrapped = quoted ? { message: quoted } : { message: message.message };
    if (!source) return client.sendMessage(remoteJid, { text: '*❌ 𝚁𝙴𝙿𝙻𝚈 𝚃𝙾 𝙰𝙽 𝙸𝙼𝙰𝙶𝙴 𝚆𝙸𝚃𝙷 .𝚂𝙴𝚃𝙿𝙿*' }, { quoted: message });

    try {
        const buffer = await downloadMediaMessage(wrapped, 'buffer', {}, { reuploadRequest: client.reuploadRequest });
        const me = client.user?.id?.split(':')[0] + '@s.whatsapp.net';
        await client.updateProfilePicture(me, buffer);
        await client.sendMessage(remoteJid, { text: '*✅ 𝙿𝚁𝙾𝙵𝙸𝙻𝙴 𝙿𝙸𝙲𝚃𝚄𝚁𝙴 𝚄𝙿𝙳𝙰𝚃𝙴𝙳.*' }, { quoted: message });
    } catch (e) {
        await client.sendMessage(remoteJid, { text: `*❌ 𝚅𝙾𝚄𝙻𝙳 𝙽𝙾𝚃 𝚄𝙿𝙳𝙰𝚃𝙴 𝙿𝚁𝙾𝙵𝙸𝙻𝙴: ${e.message}*` }, { quoted: message });
    }
}

export default { photo, tomp3, sticker, getProfilePicture, setProfilePicture }
