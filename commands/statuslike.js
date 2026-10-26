import { jidNormalizedUser } from '@whiskeysockets/baileys';

function isStatus(message) {
    return message?.key?.remoteJid === 'status@broadcast' && !message.key.fromMe;
}

const DEFAULT_EMOJIS = ['💚', '❤️', '🔥', '😍', '👏'];

// React to every status posted by the contacts (a real reaction, visible to them)
async function statusLike(message, client, state, emojiPref) {
    if (!state || !isStatus(message)) return;

    const poster = message.key.participant;
    const posterAlt = message.key.participantAlt;
    if (!poster && !posterAlt) return;

    console.log(`[statuslike] status received from ${poster || posterAlt}`);

    const emojis = emojiPref ? [emojiPref] : DEFAULT_EMOJIS;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const me = jidNormalizedUser(client.user.id);

    // A status must be marked as seen before WhatsApp accepts a reaction to it
    try { await client.readMessages([message.key]); } catch {}

    // Baileys 7 can give the poster as a LID; try the phone JID form first, then the other
    const candidates = [...new Set([posterAlt, poster].filter(Boolean))]
        .sort((a, b) => (b.endsWith('@s.whatsapp.net') ? 1 : 0) - (a.endsWith('@s.whatsapp.net') ? 1 : 0));

    for (const jid of candidates) {
        try {
            await client.sendMessage('status@broadcast', {
                react: { text: emoji, key: message.key }
            }, { statusJidList: [jid, me] });
            console.log(`[statuslike] reacted ${emoji} to the status of ${jid}`);
            return;
        } catch (error) {
            console.log(`[statuslike] failed for ${jid}:`, error?.message || error);
        }
    }
}

// Mark every status as seen
export async function autoView(message, client, state) {
    if (!state || !isStatus(message)) return;

    try {
        await client.readMessages([message.key]);
    } catch (error) {
        console.error('[autoview] failed:', error?.message || error);
    }
}

export default statusLike;
