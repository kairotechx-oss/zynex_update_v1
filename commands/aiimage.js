import axios from 'axios';

// ─── Pollinations image generation ──────────────────────────────────────────
// Railway variables (all optional except the key if your plan needs one):
//   POLLINATIONS_API_KEY   your Pollinations key
//   POLLINATIONS_BASE_URL  default: https://image.pollinations.ai/prompt
//   POLLINATIONS_MODEL     default: flux
const baseUrl = () => (process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai/prompt').replace(/\/+$/, '');
const apiKey = () => (process.env.POLLINATIONS_API_KEY || '').trim();
const model = () => process.env.POLLINATIONS_MODEL || 'flux';

export async function generateImage(prompt, { width = 1024, height = 1024 } = {}) {
    const key = apiKey();
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        const seed = Math.floor(Math.random() * 1e9);
        const params = new URLSearchParams({
            width: String(width),
            height: String(height),
            model: model(),
            seed: String(seed),
            nologo: 'true'
        });
        if (key) params.set('token', key);

        const url = `${baseUrl()}/${encodeURIComponent(prompt)}?${params.toString()}`;

        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 90000,
                headers: key ? { Authorization: `Bearer ${key}` } : {},
                validateStatus: (s) => s >= 200 && s < 300
            });

            const type = String(res.headers['content-type'] || '');
            const buffer = Buffer.from(res.data);
            if (!type.startsWith('image/') || buffer.length < 1000) {
                throw new Error('The API did not return an image');
            }
            return buffer;
        } catch (err) {
            lastError = err;
            const status = err.response?.status;
            if (status === 401 || status === 403) throw new Error('Pollinations rejected the API key (POLLINATIONS_API_KEY).');
            if (status === 402) throw new Error('Pollinations quota/credits exhausted.');
            if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
        }
    }

    const status = lastError?.response?.status;
    if (status === 429) throw new Error('Too many requests, wait a moment and try again.');
    throw new Error(lastError?.message || 'Image generation failed');
}

export function buildLogoPrompt(name) {
    return `A professional modern logo design with the exact text "${name}" in bold stylized lettering, ` +
        `centered, clean dark background, glowing neon accents, vector style, sharp, high quality, esports gaming logo`;
}

// ─── .aiimage <description> (aliases: .aigen, .imagine) ───────────────────────────────────────────────────
export async function aigen(message, client, text) {
    const remoteJid = message.key.remoteJid;
    const q = { quoted: message };

    if (!text) {
        return client.sendMessage(remoteJid, {
            text: '❌ Usage: .aiimage <description>\nEx: .aiimage a samurai under red moon, anime style'
        }, q);
    }

    try {
        await client.sendMessage(remoteJid, { text: '🎨 *Generating your image...*' }, q);
        const image = await generateImage(text);
        await client.sendMessage(remoteJid, {
            image,
            caption: `🎨 *AI IMAGE*\n\n*Prompt:* ${text}\n\n*Powered by: KAIRO ZYNEX*`
        }, q);
    } catch (err) {
        console.error('AIGEN ERROR:', err?.message || err);
        await client.sendMessage(remoteJid, { text: `❌ ${err.message}` }, q);
    }
}

export default { aigen, generateImage, buildLogoPrompt };
