import Jimp from 'jimp';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { generateImage, buildLogoPrompt } from './aiimage.js';

// ─── .logo <text> ───────────────────────────────────────────────────────────
// No reply: generates a branded logo card with the given text.
// Replying to a photo: writes the text onto that photo (like a name tag / watermark).
export async function logo(message, client, text) {
    const remoteJid = message.key.remoteJid;

    if (!text) {
        return client.sendMessage(remoteJid, {
            text: '❌ Usage: .logo <text>\nEx: .logo Mr Kairo\n\nTip: reply to a photo with .logo <text> to write the text on that photo instead.'
        }, { quoted: message });
    }

    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedImage = quoted?.imageMessage;

        // No photo replied to: create a real AI logo with this name (Pollinations).
        // If the API is unavailable, fall back to the simple card below.
        if (!quotedImage) {
            try {
                await client.sendMessage(remoteJid, { text: `🎨 *Creating the logo for* *${text}*...` }, { quoted: message });
                const aiLogo = await generateImage(buildLogoPrompt(text), { width: 1024, height: 1024 });
                return await client.sendMessage(remoteJid, {
                    image: aiLogo,
                    caption: `*${text}*\n\n*Logo created by: KAIRO ZYNEX*`
                }, { quoted: message });
            } catch (aiErr) {
                console.error('AI LOGO failed, using the simple card:', aiErr?.message || aiErr);
            }
        }

        let image;
        if (quotedImage) {
            const buffer = await downloadMediaMessage({ message: quoted, client }, 'buffer');
            image = await Jimp.read(buffer);
        } else {
            image = new Jimp(900, 500, '#0a0f1c');
            const borderColor = Jimp.rgbaToInt(63, 139, 255, 255);
            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                if (x < 10 || y < 10 || x > this.bitmap.width - 11 || y > this.bitmap.height - 11) {
                    this.setPixelColor(borderColor, x, y);
                }
            });
        }

        const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
        const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const maxWidth = image.bitmap.width - 60;
        const textHeight = Jimp.measureTextHeight(font, text, maxWidth);

        if (quotedImage) {
            // Dark translucent bar at the bottom so the text stays readable on any photo.
            const barHeight = textHeight + 30;
            const bar = new Jimp(image.bitmap.width, barHeight, 0x00000099);
            image.composite(bar, 0, image.bitmap.height - barHeight);
            image.print(font, 30, image.bitmap.height - barHeight + 15, {
                text,
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
            }, maxWidth, textHeight);
        } else {
            const y = (image.bitmap.height / 2) - (textHeight / 2);
            image.print(font, 30, y, {
                text,
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
            }, maxWidth, textHeight);
            image.print(smallFont, 0, image.bitmap.height - 36, {
                text: 'KAIRO ZYNEX',
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
            }, image.bitmap.width);
        }

        const outBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

        await client.sendMessage(remoteJid, {
            image: outBuffer,
            caption: quotedImage ? undefined : `*${text}*\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (err) {
        console.error('LOGO ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Failed to generate the logo, try again.' }, { quoted: message });
    }
}

export default { logo };
