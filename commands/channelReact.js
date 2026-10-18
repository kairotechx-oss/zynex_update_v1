// Every connected session reacts to new posts of the official WhatsApp channel.
// Each user can opt out with ".chreact off" (and back in with ".chreact on").

const EMOJIS = ['❤️', '🔥', '👏', '😍', '💯', '🙏', '⚡', '😂'];
const seen = new Set();

export async function channelReact(message, client, enabled) {
    if (enabled === false) return;

    const jid = message.key?.remoteJid;
    const serverId = message.key?.server_id || message.newsletter_server_id || message.server_id;
    if (!jid || !serverId) return;

    const me = client.user?.id?.split(':')[0] || 'unknown';
    const dedupe = `${me}:${serverId}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    if (seen.size > 5000) seen.delete(seen.values().next().value);

    // Random delay so hundreds of sessions don't all react at the same second
    const delay = 2000 + Math.floor(Math.random() * 43000);
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    setTimeout(async () => {
        try {
            await client.newsletterReactMessage(jid, String(serverId), emoji);
            console.log(`[channel-react] ${me} reacted ${emoji} to ${serverId}`);
        } catch (e) {
            console.log(`[channel-react] ${me} failed:`, e?.message || e);
        }
    }, delay);
}

export default { channelReact };
