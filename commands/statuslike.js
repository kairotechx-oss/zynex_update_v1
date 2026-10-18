import { jidNormalizedUser } from '@whiskeysockets/baileys';

function isStatus(message) {
    return message?.key?.remoteJid === 'status@broadcast' && !message.key.fromMe;
}

// React to every status the contacts post
async function statusLike(message, client, state, emojiList) {
    if (!state || !isStatus(message)) return;

    try {
        const participant = message.key.participant;
        if (!participant) return;

        const emojis = Array.isArray(emojiList) && emojiList.length ? emojiList : ['💚', '❤️', '🔥', '😍', '👏'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const me = jidNormalizedUser(client.user.id);

        await client.sendMessage('status@broadcast', {
            react: { text: emoji, key: message.key }
        }, { statusJidList: [participant, me] });

        console.log(`[statuslike] reacted ${emoji} to status of ${participant}`);
    } catch (error) {
        console.error('[statuslike] failed:', error?.message || error);
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
