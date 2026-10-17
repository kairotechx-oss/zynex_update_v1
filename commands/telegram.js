import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';

// ─── .telegram / .tgsticker / .tg <t.me/addstickers/PackName> [custom pack name] ───
// Downloads a full Telegram sticker pack (static AND animated/video) and
// resends every sticker on WhatsApp. Needs TELEGRAM_BOT_TOKEN in your env
// (get one free from @BotFather) and ffmpeg installed on the server for
// animated/video stickers.
export async function telegram(message, client, args) {
    const remoteJid = message.key.remoteJid;
    const argList = Array.isArray(args) ? args : (args || '').split(/\s+/).filter(Boolean);
    const link = argList[0] || '';
    // Everything after the link is the custom pack name the person wants
    // shown when they create the pack on WhatsApp. Defaults to a generic
    // "Stickers" label — never the bot's own name — if nothing is given.
    const customPackName = argList.slice(1).join(' ').trim();

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        return client.sendMessage(remoteJid, {
            text: '❌ TELEGRAM_BOT_TOKEN is not configured on this bot.'
        }, { quoted: message });
    }

    if (!link) {
        return client.sendMessage(remoteJid, {
            text: `📦 *TELEGRAM STICKER DOWNLOADER*\n\n❌ Please provide a Telegram sticker URL.\n\n📌 *Example:*\n.telegram https://t.me/addstickers/Porcientoreal MyPackName`
        }, { quoted: message });
    }

    if (!/(https:\/\/t\.me\/addstickers\/)/gi.test(link)) {
        return client.sendMessage(remoteJid, { text: '❌ *Invalid URL!*' }, { quoted: message });
    }

    const packName = link.replace('https://t.me/addstickers/', '').trim().split(/\s+/)[0];
    const stickerPackLabel = customPackName || 'Stickers';

    let webpmuxModule;
    try {
        webpmuxModule = await import('node-webpmux');
    } catch (e) {
        return client.sendMessage(remoteJid, {
            text: `❌ *Missing module:* ${e.message}\n\nInstall: \`npm install node-webpmux\``
        }, { quoted: message });
    }
    const webp = webpmuxModule.default || webpmuxModule;

    try {
        const res = await fetch(
            `https://api.telegram.org/bot${botToken}/getStickerSet?name=${encodeURIComponent(packName)}`,
            { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }
        );

        if (!res.ok) {
            return client.sendMessage(remoteJid, { text: `❌ HTTP ${res.status}` }, { quoted: message });
        }

        const stickerSet = await res.json();
        if (!stickerSet.ok || !stickerSet.result) {
            return client.sendMessage(remoteJid, {
                text: `❌ Invalid pack: ${JSON.stringify(stickerSet).slice(0, 200)}`
            }, { quoted: message });
        }

        const total = stickerSet.result.stickers.length;
        await client.sendMessage(remoteJid, {
            text: `📦 Found ${total} stickers\n🏷️ Pack name: ${stickerPackLabel}\n⏳ Starting download...`
        }, { quoted: message });

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        let ok = 0, failed = 0, firstError = null;

        for (let i = 0; i < total; i++) {
            const sticker = stickerSet.result.stickers[i];
            try {
                const fi = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${sticker.file_id}`);
                if (!fi.ok) throw new Error(`getFile HTTP ${fi.status}`);
                const fd = await fi.json();
                if (!fd.ok || !fd.result.file_path) throw new Error('No file_path');

                const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fd.result.file_path}`;
                const ir = await fetch(fileUrl);
                if (!ir.ok) throw new Error(`download HTTP ${ir.status}`);
                const buf = Buffer.from(await ir.arrayBuffer());

                let finalBuffer = buf;
                const ext = fd.result.file_path.split('.').pop().toLowerCase();

                if (sticker.is_animated || sticker.is_video || ext === 'tgs' || ext === 'webm') {
                    const inPath = path.join(tmpDir, `in_${Date.now()}_${i}.${ext}`);
                    const outPath = path.join(tmpDir, `out_${Date.now()}_${i}.webp`);
                    fs.writeFileSync(inPath, buf);

                    const cmd = sticker.is_video
                        ? `ffmpeg -y -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -pix_fmt yuva420p -quality 75 "${outPath}"`
                        : `ffmpeg -y -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -pix_fmt yuva420p -quality 75 "${outPath}"`;

                    await new Promise((resolve, reject) => {
                        exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
                            if (err) {
                                err.ffmpegStderr = (stderr || '').trim().split('\n').slice(-6).join('\n');
                                return reject(err);
                            }
                            resolve();
                        });
                    });

                    finalBuffer = fs.readFileSync(outPath);
                    try { fs.unlinkSync(inPath); } catch {}
                    try { fs.unlinkSync(outPath); } catch {}
                }

                const img = new webp.Image();
                await img.load(finalBuffer);

                const meta = {
                    'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
                    'sticker-pack-name': stickerPackLabel,
                    emojis: sticker.emoji ? [sticker.emoji] : ['🤖']
                };

                const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
                const jsonBuf = Buffer.from(JSON.stringify(meta), 'utf8');
                const exif = Buffer.concat([exifAttr, jsonBuf]);
                exif.writeUIntLE(jsonBuf.length, 14, 4);
                img.exif = exif;

                const out = await img.save(null);

                await client.sendMessage(remoteJid, { sticker: out }, { quoted: message });
                ok++;
                await new Promise(r => setTimeout(r, 800));

            } catch (err) {
                failed++;
                const detail = err.ffmpegStderr || err.message;
                if (!firstError) firstError = detail;
                console.error(`Sticker ${i + 1} failed:`, detail);
                continue;
            }
        }

        await client.sendMessage(remoteJid, {
            text: `✅ *Done!*\n\n✔️ Success: *${ok}/${total}*\n❌ Failed: *${failed}*\n` +
                (firstError ? `\n🐛 *First error:*\n${firstError.slice(-600)}` : '') +
                `\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (error) {
        console.error('telegram sticker error:', error);
        await client.sendMessage(remoteJid, { text: `❌ *Failed:* ${error.message}` }, { quoted: message });
    }
}

export default { telegram };
