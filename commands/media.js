import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker } from 'wa-sticker-formatter';


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

    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        const target = quoted?.videoMessage;

        if (!target) return await client.sendMessage(message.key.remoteJid, { text: "No video found." })

        const buffer = await downloadMediaMessage({ message: quoted, client }, "buffer");

        const inputPath = `./temp/video-${Date.now()}.mp4`

        const outputPath = `./temp/audio-${Date.now()}.mp3`

        if (!fs.existsSync('./temp')) fs.mkdirSync('./temp')
            
        fs.writeFileSync(inputPath, buffer)

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${inputPath} -vn -ab 128k -ar 44100 -y ${outputPath}`, (err) => {
                if (err) return reject(err)
                resolve()
            })
        })

        await client.sendMessage(message.key.remoteJid, { audio: fs.readFileSync(outputPath), mimetype: 'audio/mp4', ptt: false })

        fs.unlinkSync(inputPath)
        fs.unlinkSync(outputPath)

    } catch (e) {
        console.log(e)
        await client.sendMessage(message.key.remoteJid, { text: "*❌ 𝙴𝚁𝚁𝙾𝚁 𝚃𝙾 𝙲𝙾𝙽𝚅𝙴𝚁𝚃𝙸𝙽𝙶 𝚅𝙸𝙳𝙴𝙾 𝚃𝙾 𝙰𝚄𝙳𝙸𝙾*" })
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
        execFile('ffmpeg', args, { timeout, maxBuffer: 1024 * 1024 * 10 }, (err, _out, stderr) => {
            if (err) return reject(new Error(`ffmpeg: ${(stderr || err.message).toString().split('\n').slice(-3).join(' ').trim()}`));
            resolve();
        });
    });
}

// Video/GIF -> animated WebP (512x512, max 8s, kept under ~900 KB for WhatsApp)
async function videoToWebp(inputPath, outputPath) {
    const vf = 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,format=rgba';
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
            '-q:v', String(q), '-loop', '0', '-preset', 'default', '-vsync', '0',
            '-threads', '2', outputPath
        ]);
        lastSize = fs.statSync(outputPath).size;
        if (lastSize <= 900 * 1024) return;
    }
    throw new Error(`Video too heavy for a sticker (${Math.round(lastSize / 1024)} KB). Try a shorter video.`);
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
        try {
            const st = new Sticker(webp, { pack: 'KAIRO ZYNEX', author: 'KAIRO ZYNEX', type: 'full', quality: 50 });
            const withMeta = await withTimeout(st.toBuffer(), 25000);
            if (withMeta?.length && withMeta.length <= 1024 * 1024) finalSticker = withMeta;
        } catch (metaErr) {
            console.log('sticker metadata skipped:', metaErr.message);
        }

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
