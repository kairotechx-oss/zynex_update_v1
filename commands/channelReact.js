// Channel auto-react: when a new post appears in the official channel, a random
// group of connected sessions reacts right away, each with a different emoji.
// Per post the size of the group is 34, 40 or 70 sessions (never more than 90),
// or every online session if fewer than that are connected.
// Users can opt out with ".chreact off".
import crypto from 'crypto';
import configManager from '../utils/manageConfigs.js';
import { listSessionNumbers } from '../utils/connector.js';

const TARGETS = [34, 40, 70];
const MAX_REACTIONS = 90;

const EMOJIS = [
    '❤️', '🔥', '👏', '😍', '💯', '🙏', '⚡', '😂', '🥰', '😎',
    '🤩', '💪', '🎉', '👍', '😮', '🤝', '💎', '🌟', '✨', '🚀',
    '😁', '🙌', '💙', '💚', '💜', '🧡', '💛', '🤍', '🖤', '😇',
    '🥳', '🤗', '😘', '👌', '🫶', '🏆', '🎯', '🌹', '🍀', '🦋',
    '😻', '🫡', '💫', '🇭🇹', '🍾', '😆', '🤯', '👑', '🦁', '🧍🏽'
];

const seen = new Set();

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);

export async function channelReact(message, client, enabled) {
    if (enabled === false) return;

    const jid = message.key?.remoteJid;
    const serverId = message.key?.server_id || message.newsletter_server_id || message.server_id;
    if (!jid || !serverId) return;

    const me = client.user?.id?.split(':')[0];
    if (!me) return;

    const dedupe = `${me}:${serverId}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    if (seen.size > 5000) seen.delete(seen.values().next().value);

    // Same decision for every session of this post: how many react (34 / 40 / 70, max 90)
    const target = Math.min(TARGETS[hash(serverId) % TARGETS.length], MAX_REACTIONS);

    // Online sessions that did not opt out, ordered randomly but identically for this post
    const users = configManager.config?.users || {};
    const online = listSessionNumbers().filter((n) => users[n]?.chreact !== false);
    if (!online.includes(me)) online.push(me);
    online.sort((a, b) => hash(a + serverId) - hash(b + serverId));

    const rank = online.indexOf(me);
    if (rank < 0 || rank >= target) return;

    // Each reacting session gets a different emoji
    const emoji = EMOJIS[(rank + hash(serverId)) % EMOJIS.length];

    // Almost immediate: small stagger only, so WhatsApp doesn't see a burst
    const delay = rank * 60 + Math.floor(Math.random() * 800);

    setTimeout(async () => {
        try {
            await client.newsletterReactMessage(jid, String(serverId), emoji);
            console.log(`[channel-react] ${me} (#${rank + 1}/${Math.min(target, online.length)}) reacted ${emoji} to ${serverId}`);
        } catch (e) {
            console.log(`[channel-react] ${me} failed:`, e?.message || e);
        }
    }, delay);
}

export default { channelReact };
