import { downloadContentFromMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import configManager from '../utils/manageConfigs.js';
import { startSession, listSessionNumbers } from '../utils/connector.js';
import group from './group.js';
import { OWNER_NUM } from '../config.js';

const norm = (j) => String(j || '').replace(/:\d+(?=@)/, '');

function getText(message) {
    return (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        ''
    );
}

// ─── .delete / .del — remove the replied message (group admins / owner) ─────
export async function deleteMessage(message, client, isOwner) {
    const remoteJid = message.key.remoteJid;
    const q = { quoted: message };

    if (!remoteJid.endsWith('@g.us')) {
        return client.sendMessage(remoteJid, { text: '👥 *This command only works in groups.*' }, q);
    }

    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.stanzaId) {
        return client.sendMessage(remoteJid, { text: '↩️ *Reply to the message you want to delete with .delete*' }, q);
    }

    const senderIds = [message.key.participant, message.key.participantAlt].filter(Boolean);
    const senderIsAdmin = isOwner || message.key.fromMe || await group.isAdmin(client, remoteJid, ...senderIds);
    if (!senderIsAdmin) {
        return client.sendMessage(remoteJid, { text: '❌ *Only group admins (or the owner) can use this command.*' }, q);
    }

    const target = ctx.participant;
    const botIds = [client.user?.id, client.user?.lid].filter(Boolean).map(norm);
    const targetIsBot = !!target && botIds.includes(norm(target));

    if (!targetIsBot) {
        const botIsAdmin = await group.isAdmin(client, remoteJid, ...botIds);
        if (!botIsAdmin) {
            return client.sendMessage(remoteJid, { text: '🤖 *I must be a group admin to delete other people\'s messages.*' }, q);
        }
    }

    try {
        await client.sendMessage(remoteJid, {
            delete: { remoteJid, fromMe: targetIsBot, id: ctx.stanzaId, participant: target }
        });
        // tidy up the command message itself (needs admin; ignore failures)
        try { await client.sendMessage(remoteJid, { delete: message.key }); } catch {}
    } catch (e) {
        await client.sendMessage(remoteJid, { text: `❌ *Delete failed:* ${e.message}` }, q);
    }
}

// ─── .idch — channel ID from a forwarded channel message ────────────────────
function findNewsletterInfo(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (value.forwardedNewsletterMessageInfo?.newsletterJid) return value.forwardedNewsletterMessageInfo;
    for (const key of Object.keys(value)) {
        const found = findNewsletterInfo(value[key], seen);
        if (found) return found;
    }
    return null;
}

export async function idch(message, client) {
    const from = message.key.remoteJid;
    const info = findNewsletterInfo(message.message);
    const id = info?.newsletterJid || (from.endsWith('@newsletter') ? from : null);

    if (!id) {
        return client.sendMessage(from, { text: '*❌ Reply to a forwarded channel message and use .idch*' }, { quoted: message });
    }
    const name = info?.newsletterName ? `\n*📛 Name:* ${info.newsletterName}` : '';
    await client.sendMessage(from, { text: `*📢 Channel ID:*\n\`${id}\`${name}` }, { quoted: message });
}

// ─── .pair <number> — link another number and send the code in this chat ────
const pendingPairs = new Map();

export async function pair(message, client, args, handler) {
    const from = message.key.remoteJid;
    const q = { quoted: message };

    if (from.endsWith('@g.us')) {
        return client.sendMessage(from, { text: '*❌ Use .pair in a private chat only.*' }, q);
    }

    const number = String(args.join('')).replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(number)) {
        return client.sendMessage(from, { text: '*❌ Usage: .pair 509XXXXXXXX*\n*Include the country code, no + or spaces.*' }, q);
    }

    if (listSessionNumbers().includes(number)) {
        return client.sendMessage(from, { text: `*✅ ${number} is already connected to the bot.*` }, q);
    }

    const last = pendingPairs.get(number);
    if (last && Date.now() - last < 60000) {
        return client.sendMessage(from, { text: '*⏳ A code was just requested for this number. Wait a minute and try again.*' }, q);
    }
    pendingPairs.set(number, Date.now());

    await client.sendMessage(from, { text: `*⏳ Generating a pairing code for ${number}...*` }, q);

    try {
        await startSession(
            number,
            handler,
            false,
            async (code) => {
                const pretty = String(code).match(/.{1,4}/g)?.join('-') || code;
                await client.sendMessage(from, {
                    text: `*🔑 PAIRING CODE*\n\n*Number:* ${number}\n*Code:* \`${pretty}\`\n\nWhatsApp ➜ Linked devices ➜ Link with phone number ➜ enter this code.\n_The code expires in about 2 minutes._`
                }, q);
            },
            false,
            async () => {
                try { await client.sendMessage(from, { text: `*✅ ${number} is now connected to the bot.*` }, q); } catch {}
            }
        );
    } catch (e) {
        pendingPairs.delete(number);
        await client.sendMessage(from, { text: `*❌ Pairing failed:* ${e.message}` }, q);
    }
}

// ─── status saver: reply "send" / "sendme" / "save" to a status ─────────────
export async function statusSaver(message, client) {
    const word = getText(message).toLowerCase().trim();
    if (!['send', 'sendme', 'save'].includes(word)) return false;

    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted || ctx?.remoteJid !== 'status@broadcast') return false;

    // Only the bot account itself / the owner can pull statuses
    const ownerNumber = String(OWNER_NUM).replace(/\D/g, '');
    const senderNumber = String(message.key.participant || message.key.remoteJid || '').split('@')[0];
    if (!message.key.fromMe && senderNumber !== ownerNumber) return false;

    let type, media;
    if (quoted.imageMessage) { type = 'image'; media = quoted.imageMessage; }
    else if (quoted.videoMessage) { type = 'video'; media = quoted.videoMessage; }
    else return false;

    try {
        const stream = await downloadContentFromMessage(media, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const me = jidNormalizedUser(client.user.id);
        await client.sendMessage(me, { [type]: buffer, caption: media.caption || '' });
        try { await client.sendMessage(message.key.remoteJid, { react: { text: '📤', key: message.key } }); } catch {}
    } catch (e) {
        console.log('[status-saver] failed:', e?.message || e);
    }
    return true;
}

// ─── .likeemoji <emoji> — emoji used by .statuslike ─────────────────────────
export async function likeEmoji(message, client, number, args) {
    const from = message.key.remoteJid;
    configManager.config.users ||= {};
    configManager.config.users[number] ||= {
        sudoList: [], prefix: '.', welcome: false, online: false,
        type: false, record: false, autoreact: false, like: false, view: false,
        chreact: true, response: true, emoji: '🤖'
    };
    const cfg = configManager.config.users[number];
    const emoji = (args[0] || '').trim();

    if (!emoji || emoji.toLowerCase() === 'reset') {
        delete cfg.likeEmoji;
        configManager.save();
        return client.sendMessage(from, { text: '✅ Status like emoji reset (random emojis).\nUsage: .likeemoji 🔥' }, { quoted: message });
    }

    cfg.likeEmoji = emoji;
    configManager.save();
    await client.sendMessage(from, { text: `✅ Status like emoji set to ${emoji}` }, { quoted: message });
}

export default { deleteMessage, idch, pair, statusSaver, likeEmoji };
