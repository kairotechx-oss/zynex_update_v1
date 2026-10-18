import{ isJidGroup, getContentType } from '@whiskeysockets/baileys';

import configManager from '../utils/manageConfigs.js';

import channelSender from '../commands/channelSender.js'

import fs from 'fs';

import path from 'path';

export async function handleGroupAction(message, client, action) {

    const remoteJid = message.key.remoteJid;

    try {

        const messageBody = message.message?.extendedTextMessage?.text || message.message?.conversation || '';

        const commandAndArgs = messageBody.slice(1).trim(); // Remove prefix and trim

        const parts = commandAndArgs.split(/\s+/);

        const args = parts.slice(1);

        const user = message.key.participant;

        console.log(args)

        let participant;

        if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {

            participant = message.message.extendedTextMessage.contextInfo.participant;

        } else if (args.length > 0) {

            if (user.includes("@lid")) {

                participant = args[0].replace('@', '') + '@lid';

            } else {

                participant = args[0].replace('@', '') + '@s.whatsapp.net';

            }

            console.log(participant);

        } else {

            throw new Error('𝙽𝙾 𝙿𝙰𝚁𝚃𝙸𝙲𝙸𝙿𝙰𝙽𝚃 𝚂𝙿𝙴𝙲𝙸𝙵𝙸𝙴𝙳.*');
        }
        
        const num = `@${participant.replace('@s.whatsapp.net', '')}`;

        await client.groupParticipantsUpdate(remoteJid, [participant], action);
        
        const actionMessages = {

            remove: `*${num} 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝚁𝙴𝙼𝙾𝚅𝙴𝙳.*`,

            promote: `*${num} 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝙿𝚁𝙾𝙼𝙾𝚃𝙴𝙳 𝚃𝙾 𝙰𝙳𝙼𝙸𝙽.*`,

            demote: `*${num} 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝚁𝙴𝙼𝙾𝚅𝙴𝙳 𝙰𝚂 𝙰𝙽 𝙰𝙳𝙼𝙸𝙽.*`
        };

        await client.sendMessage(remoteJid, { text: actionMessages[action] });

    } catch (error) {

        await client.sendMessage(remoteJid, { text: `*𝙴𝚁𝚁𝙾𝚁: 𝚄𝙽𝙰𝙱𝙻𝙴 𝚃𝙾 𝙿𝙴𝚁𝙵𝙾𝚁𝙼 𝙰𝙲𝚃𝙸𝙾𝙽. ${error.message}*` });
    }
}

export async function kick(message, client) {

    await handleGroupAction(message, client, 'remove');
}

export async function promote(message, client) {

    await handleGroupAction(message, client, 'promote');
}

export async function demote(message, client) {

    await handleGroupAction(message, client, 'demote');
}

export async function kickall(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        const groupMetadata = await client.groupMetadata(remoteJid);

        const participants = groupMetadata.participants;

        for (const participant of participants) {

            if (!participant.admin) {

                try {

                    await client.groupParticipantsUpdate(remoteJid, [participant.id], 'remove');

                } catch (err) {

                    console.log(err)

                    //await client.sendMessage(remoteJid, { text: `_Failed to remove: @${participant.id.split('@')[0]} - ${err.message}_`, mentions: [participant.id] });
                }
            }
        }
        
        await client.sendMessage(remoteJid, { text: '*𝙶𝚁𝙾𝚄𝙿 𝙲𝙻𝙴𝙰𝙽𝚄𝙿 𝙲𝙾𝙼𝙿𝙻𝙴𝚃𝙴𝙳*' });

    } catch (error) {

        await client.sendMessage(remoteJid, { text: `*𝙴𝚁𝚁𝙾𝚁: 𝚄𝙽𝙰𝙱𝙻𝙴 𝚃𝙾 𝙿𝚁𝙾𝙲𝙴𝚂𝚂 𝚁𝙴𝙼𝙾𝚅𝙰𝙻. ${error.message}*` });
    }
}

export async function purge(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        const groupMetadata = await client.groupMetadata(remoteJid);

        const nonAdmins = groupMetadata.participants.filter(p => !p.admin).map(p => p.id);

        if (nonAdmins.length === 0) {

            await client.sendMessage(remoteJid, { text: '𝙽𝙾 𝙽𝙾𝙽-𝙰𝙳𝙼𝙸𝙽 𝙼𝙴𝙼𝙱𝙴𝚁𝚂 𝚃𝙾 𝚁𝙴𝙼𝙾𝚅𝙴.*' });

            return;
        }

        await client.groupParticipantsUpdate(remoteJid, nonAdmins, 'remove');

        await client.sendMessage(remoteJid, { text: '*𝚃𝙷𝙸𝚂 𝙶𝚁𝙾𝚄𝙿 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝙿𝚄𝚁𝙸𝙵𝙸𝙴𝙳.*' });

    } catch (error) {

         console.log(err)

        //await client.sendMessage(remoteJid, { text: `_Error: Unable to remove participants. ${error.message}_` });
    }
}

export async function bye(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        await client.sendMessage(remoteJid, { text: '_Goodbye!_' });

        await client.groupLeave(remoteJid);

    } catch (error) {

        await client.sendMessage(remoteJid, { text: `*𝙴𝚁𝚁𝙾𝚁: 𝚄𝙽𝙰𝙱𝙻𝙴 𝚃𝙾 𝙻𝙴𝙰𝚅𝙴 𝚃𝙷𝙴 𝙶𝚁𝙾𝚄𝙿. ${error.message}*` });
    }
}


export async function pall(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        const groupMetadata = await client.groupMetadata(remoteJid);

        const nonAdmins = groupMetadata.participants.filter(p => !p.admin).map(p => p.id);

        await client.groupParticipantsUpdate(remoteJid, nonAdmins, 'promote');

    } catch (error) {

        await client.sendMessage(remoteJid, { text: `*𝙴𝚁𝚁𝙾𝚁: 𝚄𝙽𝙰𝙱𝙻𝙴 𝚃𝙾 𝙿𝚁𝙾𝙼𝙾𝚃𝙴 𝙿𝙰𝚁𝚃𝙸𝙲𝙸𝙿𝙰𝙽𝚃𝚂. ${error.message}*` });
    }
}

// Placeholder for new functions (dall, mute, unmute, gclink, antilink, linkDetection)
export async function dall(message, client, userLid) {
    
    const remoteJid = message.key.remoteJid;

    try {

        const { participants } = await client.groupMetadata(remoteJid);

        const botNumber = client.user.id.split(':')[0] + '@s.whatsapp.net';

        const botId = userLid 
    ? userLid.split(':')[0] + "@lid" 
    : "";   

        console.log(botId)

        console.log(participants)

        const admins = participants.filter(p => p.admin && p.id !== botNumber && p.id !== botId).map(p => p.id);

        if (admins.length > 0) {

            await  client.groupParticipantsUpdate(remoteJid, admins, 'demote');

            await client.sendMessage(remoteJid, { text: '*𝙸 𝙰𝙼𝙳 𝚃𝙰𝙺𝙸𝙽𝙶 𝙲𝙾𝙽𝚃𝚁𝙾𝙻 𝙾𝙵 𝚃𝙷𝙸𝚂 𝙶𝚁𝙾𝚄𝙿 𝙵𝙾𝚁 𝙽𝙾𝚆.*' });
        }
    } catch (error) {

        await client.sendMessage(remoteJid, { text: `_Error: ${error.message}_` });
    }
}
export async function mute(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        await client.groupSettingUpdate(remoteJid, 'announcement');

        await client.sendMessage(remoteJid, { text: '*𝚃𝙷𝙴 𝙶𝚁𝙾𝚄𝙿 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝙼𝚄𝚃𝙴𝙳.*' });

    } catch (error) {

        await client.sendMessage(remoteJid, { text: `_Error: ${error.message}_` });
    }

}
export async function unmute(message, client) {

    const remoteJid = message.key.remoteJid;

    try {

        await client.groupSettingUpdate(remoteJid, 'not_announcement');

        await client.sendMessage(remoteJid, { text: '*𝚃𝙷𝙴 𝙶𝚁𝙾𝚄𝙿 𝙷𝙰𝚂 𝙱𝙴𝙴𝙽 𝚄𝙽𝙼𝚄𝚃𝙴𝙳.*' });

    } catch (error) {
        
        await client.sendMessage(remoteJid, { text: `_Error: ${error.message}_` });
    }
}
export async function gclink(message, client) {
    
    const remoteJid = message.key.remoteJid;

    try {

        const code = await client.groupInviteCode(remoteJid);

        await client.sendMessage(remoteJid, {

        text: `https://chat.whatsapp.com/${code}`
    });

    }catch (error) {

        await client.sendMessage(remoteJid, { text: `*𝙴𝚁𝚁𝙾𝚁 𝙶𝙴𝙽𝙴𝚁𝙰𝚃𝙸𝙽𝙶 𝙶𝚁𝙾𝚄𝙿 𝙻𝙸𝙽𝙺 𝚈𝙾𝚄 𝙰𝚁𝙴 𝙽𝙾𝚃 𝙰𝙳𝙼𝙸𝙽: ${error.message}*` });
    }
}
function ensureUserCfg(number) {
    configManager.config.users ||= {};
    configManager.config.users[number] ||= {
        sudoList: [], prefix: '.', welcome: false, online: false,
        type: false, record: false, autoreact: false, like: false, view: false,
        response: true, emoji: '🤖'
    };
    return configManager.config.users[number];
}

export async function antilink(message, client) {

    const number = client.user.id.split(':')[0];
    const remoteJid = message.key.remoteJid;

    const messageBody = message.message?.conversation || message.message?.extendedTextMessage?.text || "";
    const option = (messageBody.trim().split(/\s+/)[1] || '').toLowerCase();

    try {
        const cfg = ensureUserCfg(number);

        if (option === 'on') {
            cfg.antilink = true;
            configManager.save();
            await client.sendMessage(remoteJid, { text: "*✅ 𝙰𝙽𝚃𝙸𝙻𝙸𝙽𝙺 𝙴𝙽𝙰𝙱𝙻𝙴𝙳*\nLinks from non-admins will be deleted (the bot must be admin)." }, { quoted: message });
        } else if (option === 'off') {
            cfg.antilink = false;
            configManager.save();
            await client.sendMessage(remoteJid, { text: "*✅ 𝙰𝙽𝚃𝙸𝙻𝙸𝙽𝙺 𝙳𝙸𝚂𝙰𝙱𝙻𝙴𝙳*" }, { quoted: message });
        } else if (option === 'kick') {
            cfg.antilink = 'kick';
            configManager.save();
            await client.sendMessage(remoteJid, { text: "*✅ 𝙰𝙽𝚃𝙸𝙻𝙸𝙽𝙺 𝙺𝙸𝙲𝙺 𝙼𝙾𝙳𝙴 𝙴𝙽𝙰𝙱𝙻𝙴𝙳*\nLinks are deleted and the sender is removed." }, { quoted: message });
        } else {
            await client.sendMessage(remoteJid, { text: "*𝚄𝚂𝙰𝙶𝙴: .antilink on | off | kick*" }, { quoted: message });
        }
    } catch (error) {
        console.error("❌ antilink command error:", error);
    }
}

function normJid(j) {
    return String(j || '').replace(/:\d+(?=@)/, '');
}

async function linkDetection(message, client, lids = []) {

    const number = client.user.id.split(':')[0];
    const remoteJid = message.key.remoteJid;

    if (!remoteJid?.endsWith("@g.us")) return;
    if (message.key.fromMe) return;

    const detect = configManager.config?.users?.[number]?.antilink;
    if (!detect) return;

    const messageBody =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        "";

    try {
        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|\b[a-z0-9-]+\.(com|net|org|info|biz|io|me|app|site|link|store|xyz|online)\b)/i;
        if (!linkRegex.test(messageBody)) return;

        const senderIds = [message.key.participant, message.key.participantAlt, message.key.remoteJidAlt].filter(Boolean);
        const botIds = [
            number + "@s.whatsapp.net",
            client.user?.id,
            client.user?.lid,
            ...(Array.isArray(lids) ? lids : [lids])
        ].filter(Boolean);

        console.log(`*🔗 LINK DETECTED from ${senderIds[0]}: ${messageBody.slice(0, 80)}`);

        const senderIsAdmin = await isAdmin(client, remoteJid, ...senderIds);
        if (senderIsAdmin) { console.log("antilink: sender is admin, skip"); return; }

        const botIsAdmin = await isAdmin(client, remoteJid, ...botIds);
        if (!botIsAdmin) { console.log("antilink: bot is not admin, cannot delete"); return; }

        await client.sendMessage(remoteJid, { delete: message.key });
        await client.sendMessage(remoteJid, {
            text: `*🚫 𝙻𝙸𝙽𝙺𝚂 𝙰𝚁𝙴 𝙽𝙾𝚃 𝙰𝙻𝙻𝙾𝚆𝙴𝙳!* @${(senderIds[0] || '').split('@')[0].split(':')[0]}`,
            mentions: senderIds.slice(0, 1)
        });

        if (detect === "kick") {
            await client.groupParticipantsUpdate(remoteJid, [senderIds[0]], "remove");
        }

    } catch (error) {
        console.error("❌ linkDetection error:", error);
    }
}


// Admin check that works with both phone-number JIDs and LIDs (Baileys 7)
async function isAdmin(client, groupJid, ...userJids) {

    try {
        const wanted = userJids.flat().filter(Boolean).map(normJid);
        if (!wanted.length) return false;

        const metadata = await client.groupMetadata(groupJid);

        return metadata.participants.some(p => {
            if (!p.admin) return false;
            return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(normJid).some(x => wanted.includes(x));
        });

    } catch (error) {
        console.error("❌ Error fetching group metadata:", error);
        return false;
    }
}

export async function welcome(update, client) {

    const metadata = await client.groupMetadata(update.id);

    const number = client.user.id.split(':')[0];

    const state = configManager.config?.users[number]?.welcome;

    for (const participant of update.participants) {

        console.log(participant)

        if (!state) continue;

        try {

            const pp = await client.profilePictureUrl(participant, 'image')

                .catch(() => null);

            const name = (await client.onWhatsApp(participant.split("@")[0]))

                ?.at(0)?.notify || participant.split("@")[0];

            if (update.action === 'add') {
                const welcomeMsg = `
┏━━━━━━━━━━━━━━━┓
┃   *𝚆𝙴𝙻𝙲𝙾𝙼𝙴!*  😻 ┃
┗━━━━━━━━━━━━━━━┛

👤 @${participant.split('@')[0]}
*🙋 𝚈𝙾𝚄'𝚅𝙴 𝙹𝙾𝙸𝙽𝙴𝙳* ${metadata.subject}!

*🪶 𝙼𝙰𝙺𝙴 𝚈𝙾𝚄𝙵𝙴𝙻𝙵 𝙰𝚃 𝙷𝙾𝙼𝙴.*
*🪶 𝙳𝙾𝙽'𝚃 𝙵𝙾𝚁𝙶𝙴𝚃 𝚃𝙾 𝚁𝙴𝙰𝙳 𝚃𝙷𝙴 𝙶𝚁𝙾𝚄𝙿 𝚁𝚄𝙻𝙴𝚂.*

*💂 POWERED BY KAIRO ZYNEX*
                `.trim();

                await client.sendMessage(update.id, {
                    image: pp ? { url: pp } : fs.readFileSync(path.join(process.cwd(), 'menu.jpg')),
                    caption: welcomeMsg,
                    mentions: [participant]
                });
            }

            if (update.action === 'remove') {
                const byeMsg = `
┏━━━━━━━━━━━━━━━━┓
┃   *𝙶𝙾𝙾𝙳𝙱𝚈𝙴!* 🧍   ┃
┗━━━━━━━━━━━━━━━━┛

👤 @${participant.split('@')[0]}
*🏌️𝙻𝙴𝙵𝚃* ${metadata.subject}

*⛷️ 𝚆𝙴'𝙻𝙻 𝙼𝙸𝚂𝚂 𝚈𝙾𝚄...*

*💂 POWERED BY KAIRO ZYNEX*
                `.trim();

                await client.sendMessage(update.id, {
                    image: pp ? { url: pp } : fs.readFileSync(path.join(process.cwd(), 'menu.jpg')),
                    caption: byeMsg,
                    mentions: [participant]
                });
            }
        } catch (err) {
            console.error("*❌ 𝙴𝚁𝚁𝙾𝚁 𝙸𝙽 𝚠𝚎𝚕𝚌𝚘𝚖𝚎/𝚐𝚘𝚘𝚍𝚋𝚢𝚎:*", err);
        }
    }
}


export function gcid(message, client) {

    const remoteJid = message.key.remoteJid;

    if (remoteJid.endsWith('@g.us')) {

        channelSender(message, client, `*𝚃𝙷𝙴 𝙶𝚁𝙾𝚄𝙿 𝙸𝙳 𝙸𝚂 : ${remoteJid}*`, 5);

    } else {

        channelSender(message, client, `*𝚂𝙾𝚁𝚁𝚈 𝚃𝙷𝙸𝚂 𝙸𝚂 𝙽𝙾𝚃 𝙰 𝙶𝚁𝙾𝚄𝙿.*`, 3);
    }
}

export async function mentiondetect(message, client, lids = []){

    const remoteJid = message.key.remoteJid;

    const number = client.user.id.split(':')[0];

    const senderJid = message.key.participant || remoteJid;

    const botId = number + "@s.whatsapp.net";

    // Ensure lids is an array
    const botLids = Array.isArray(lids) ? lids : [lids];

    const state = configManager.config?.users[number]?.mention;

    const type = getContentType(message.message);

    console.log(type)

    if (type  === 'groupStatusMentionMessage') {

        console.log("mention detected");

        const senderIsAdmin = await isAdmin(client, remoteJid, senderJid);

        // Check if bot or any linked instance is admin
        const mainBotIsAdmin = await isAdmin(client, remoteJid, botId);

        const linkedBotsAreAdmin = await Promise.all(botLids.map(lid => isAdmin(client, remoteJid, lid)));

        const atLeastOneLinkedBotAdmin = linkedBotsAreAdmin.includes(true);

        const botIsAdmin = mainBotIsAdmin || atLeastOneLinkedBotAdmin;

        // Check if sender is the bot or any of its linked IDs
        const senderIsBot = senderJid === botId || botLids.includes(senderJid);

        if (!botIsAdmin || senderIsAdmin || senderIsBot) return;

        await client.sendMessage(remoteJid, { delete: message.key });


    } else{

        console.log("None")
    }
}




export default { kick, kickall, promote, demote, bye, pall, dall, mute, unmute, gclink, antilink, linkDetection, purge, welcome, gcid, mentiondetect, isAdmin };
