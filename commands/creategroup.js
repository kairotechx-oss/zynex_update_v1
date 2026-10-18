import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { OWNER_NUM } from '../config.js';

// ─── .creategc <name> / .creategroup <name> ─────────────────────────────────
// Owner only. Creates a new WhatsApp group, adds the sender and sends the invite link.
export async function creategroup(message, client, name, isOwner) {
    const remoteJid = message.key.remoteJid;
    const q = { quoted: message };

    if (!isOwner) {
        return client.sendMessage(remoteJid, { text: '❌ This command is for the bot owner only.' }, q);
    }

    const subject = String(name || '').trim().slice(0, 25) || 'KAIRO ZYNEX';

    try {
        const me = jidNormalizedUser(client.user.id);
        const sender = message.key.participant || (remoteJid.endsWith('@g.us') ? null : remoteJid);
        const ownerJid = `${String(OWNER_NUM).replace(/\D/g, '')}@s.whatsapp.net`;

        const members = [sender, ownerJid]
            .filter(Boolean)
            .map(j => jidNormalizedUser(j))
            .filter((j, i, arr) => j !== me && arr.indexOf(j) === i);

        const group = await client.groupCreate(subject, members);
        const code = await client.groupInviteCode(group.id);

        await client.sendMessage(remoteJid, {
            text: `✅ *Group created:* ${subject}\n🔗 https://chat.whatsapp.com/${code}\n\n> *Powered by KAIRO ZYNEX*`
        }, q);
    } catch (e) {
        console.error('[creategc]', e);
        await client.sendMessage(remoteJid, { text: `❌ Could not create the group: ${e?.message || e}` }, q);
    }
}

export default { creategroup };
