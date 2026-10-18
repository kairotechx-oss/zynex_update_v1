
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import configManager from '../utils/manageConfigs.js';

const DEFAULT_AVATAR = 'https://img.pyrocdn.com/dbKUgahg.png';
const BOT_URL = 'https://zynex-pair-code.up.railway.app';
const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDmi1g77qVOA4cfRq13';

// ─── per-group config ───────────────────────────────────────────────────────
function getGroupCfg(groupId) {
    configManager.config.groups ||= {};
    configManager.config.groups[groupId] ||= {};
    return configManager.config.groups[groupId];
}

function isEnabled(groupId) {
    return getGroupCfg(groupId).welcome !== false;
}

// ─── helpers (Baileys 7: participants can be strings OR objects, jid or lid) ─
function participantJid(p) {
    if (typeof p === 'string') return p;
    return p?.id || p?.jid || p?.phoneNumber || String(p);
}

function participantNumber(p) {
    if (p && typeof p === 'object' && p.phoneNumber) return String(p.phoneNumber).split('@')[0].split(':')[0];
    return participantJid(p).split('@')[0].split(':')[0];
}

function findDisplayName(groupMetadata, p, fallback) {
    try {
        const jid = participantJid(p);
        const found = groupMetadata.participants.find(x => x.id === jid || x.phoneNumber === jid || x.lid === jid);
        return found?.name || found?.notify || fallback;
    } catch {
        return fallback;
    }
}

function fill(template, { number, group, description }) {
    return template
        .replace(/{user}/g, `@${number}`)
        .replace(/{group}/g, group)
        .replace(/{description}/g, description)
        .replace(/{bot}/g, BOT_URL)
        .replace(/{channel}/g, CHANNEL_URL);
}

async function fetchImage(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    if (!res.data || res.data.length < 500) throw new Error('empty image');
    return Buffer.from(res.data);
}

// ─── build + send one welcome / goodbye ─────────────────────────────────────
async function sendJoinLeave(sock, groupId, groupMetadata, participant, type) {
    const jid = participantJid(participant);
    const number = participantNumber(participant);
    const displayName = findDisplayName(groupMetadata, participant, number);
    const groupName = groupMetadata.subject || 'this group';
    const groupDesc = groupMetadata.desc || 'No description available';
    const memberCount = groupMetadata.participants.length;
    const cfg = getGroupCfg(groupId);
    const custom = type === 'add' ? cfg.welcomeText : cfg.goodbyeText;

    let caption;
    if (custom) {
        caption = fill(custom, { number, group: groupName, description: groupDesc });
    } else if (type === 'add') {
        const timeString = new Date().toLocaleString('en-US', {
            month: '2-digit', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
        caption = `╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @${number} 👋\n┃Member count: #${memberCount}\n┃𝚃𝙸𝙼𝙴: ${timeString}⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@${number}* Welcome to *${groupName}*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\n${groupDesc}\n\n🤖 *Bot:* ${BOT_URL}\n📢 *Channel:* ${CHANNEL_URL}\n\n> *Powered by KAIRO ZYNEX*`;
    } else {
        caption = `*@${number}* we will never miss you! 👋\n\n> *Powered by KAIRO ZYNEX*`;
    }

    // Profile picture (fallback to a default avatar)
    let avatar = DEFAULT_AVATAR;
    try {
        const pp = await sock.profilePictureUrl(jid, 'image');
        if (pp) avatar = pp;
    } catch {}

    // 1) generated welcome image
    try {
        const kind = type === 'add' ? 'gaming3' : 'gaming1';
        const action = type === 'add' ? 'join' : 'leave';
        const color = type === 'add' ? 'green' : 'red';
        const apiUrl = `https://api.some-random-api.com/welcome/img/2/${kind}?type=${action}&textcolor=${color}&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${memberCount}&avatar=${encodeURIComponent(avatar)}`;
        const image = await fetchImage(apiUrl);
        await sock.sendMessage(groupId, { image, caption, mentions: [jid] });
        return;
    } catch (e) {
        console.log('[welcome] image API failed, trying local photo:', e.message);
    }

    // 2) local bot photo
    try {
        await sock.sendMessage(groupId, {
            image: fs.readFileSync(path.join(process.cwd(), 'menu.jpg')),
            caption,
            mentions: [jid]
        });
        return;
    } catch (e) {
        console.log('[welcome] local photo failed, falling back to text:', e.message);
    }

    // 3) plain text
    await sock.sendMessage(groupId, { text: caption, mentions: [jid] });
}

// ─── called from utils/connector.js on 'group-participants.update' ──────────
export async function handleGroupUpdate(update, sock) {
    try {
        const { id: groupId, participants, action } = update || {};
        if (!groupId || !participants?.length) return;
        if (action !== 'add' && action !== 'remove') return;
        if (!isEnabled(groupId)) return;

        const groupMetadata = await sock.groupMetadata(groupId);

        for (const participant of participants) {
            try {
                await sendJoinLeave(sock, groupId, groupMetadata, participant, action);
            } catch (e) {
                console.error('[welcome] send error:', e?.message || e);
            }
        }
    } catch (e) {
        console.error('[welcome] listener error:', e?.message || e);
    }
}

async function isSenderAdminOrOwner(client, remoteJid, senderJid, isOwner) {
    if (isOwner) return true;
    try {
        const meta = await client.groupMetadata(remoteJid);
        return meta.participants.some(p => (p.id === senderJid || p.phoneNumber === senderJid || p.lid === senderJid) && p.admin);
    } catch {
        return false;
    }
}

async function toggle(message, client, args, isOwner, kind) {
    const remoteJid = message.key.remoteJid;
    const q = { quoted: message };
    if (!remoteJid.endsWith('@g.us')) {
        return client.sendMessage(remoteJid, { text: '👥 This command only works in groups.' }, q);
    }

    const senderJid = message.key.participant || message.key.remoteJid;
    if (!(await isSenderAdminOrOwner(client, remoteJid, senderJid, isOwner))) {
        return client.sendMessage(remoteJid, { text: '❌ Only group admins or the bot owner can configure this.' }, q);
    }

    const cfg = getGroupCfg(remoteJid);
    const option = (args[0] || '').toLowerCase();
    const textKey = kind === 'welcome' ? 'welcomeText' : 'goodbyeText';
    const label = kind === 'welcome' ? 'Welcome' : 'Goodbye';

    if (option === 'on' || option === 'off') {
        cfg.welcome = option === 'on';
        configManager.save();
        return client.sendMessage(remoteJid, { text: `✅ Welcome & Goodbye messages turned ${option.toUpperCase()} for this group.` }, q);
    }

    if (option === 'reset') {
        delete cfg[textKey];
        configManager.save();
        return client.sendMessage(remoteJid, { text: `✅ ${label} message reset to default.` }, q);
    }

    const customText = args.join(' ').trim();
    if (customText) {
        cfg[textKey] = customText;
        configManager.save();
        return client.sendMessage(remoteJid, { text: `✅ Custom ${kind} message saved.\nPlaceholders: {user} {group} {description} {bot} {channel}` }, q);
    }

    const cmd = `.${kind}`;
    return client.sendMessage(remoteJid, {
        text: `👋 ${label} Settings\n\n🔸 Status: ${isEnabled(remoteJid) ? 'ON' : 'OFF'}\n🔸 Custom message: ${cfg[textKey] ? 'yes' : 'default'}\n\nUsage:\n${cmd} on\n${cmd} off\n${cmd} reset\n${cmd} <text with {user} {group} {description}>`
    }, q);
}

export async function welcomeToggle(message, client, args, isOwner) {
    return toggle(message, client, args, isOwner, 'welcome');
}

export async function goodbyeToggle(message, client, args, isOwner) {
    return toggle(message, client, args, isOwner, 'goodbye');
}

export default { handleGroupUpdate, welcomeToggle, goodbyeToggle };
