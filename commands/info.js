import configManager from '../utils/manageConfigs.js'

import { BOT_NAME } from '../config.js'

import { OWNER_NAME } from '../config.js'

import fs from 'fs';

import path from 'path';

import { WA_CHANNEL } from "../config.js"


export async function info(message, client) {

    const remoteJid = message.key.remoteJid;

    const today = new Date();

    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const currentDay = daysOfWeek[today.getDay()];

    const currentDate = today.getDate();

    const currentMonth = today.getMonth() + 1; 

    const currentYear = today.getFullYear();

    const owner = "KAIRO ZYNEX";

    const number = client.user.id.split(':')[0];

    const username = message.pushName || "Unknown";

    const prefix = (configManager.config.users[number]?.prefix || '.');

    const uptimeSeconds = Math.floor(process.uptime());
    const upH = Math.floor(uptimeSeconds / 3600);
    const upM = Math.floor((uptimeSeconds % 3600) / 60);
    const upS = uptimeSeconds % 60;
    const runtime = `${upH}h ${upM}m ${upS}s`;

    const botMode = (configManager.config.botMode || 'public');
    const modeLabel = botMode.charAt(0).toUpperCase() + botMode.slice(1);

    const menuBody = `
『 🧸 Menu 』
╭───────────────────⊷
┋ ⬡ ${prefix}menu
┋ ⬡ ${prefix}alive
┋ ⬡ ${prefix}runtime
╰───────────────────⊷

『 🛠️ Tools 』
╭───────────────────⊷
┋ ⬡ ${prefix}ping
┋ ⬡ ${prefix}getid
┋ ⬡ ${prefix}idch
┋ ⬡ ${prefix}pair
┋ ⬡ ${prefix}sudo
┋ ⬡ ${prefix}tourl
┋ ⬡ ${prefix}owner
┋ ⬡ ${prefix}fancy
┋ ⬡ ${prefix}update
┋ ⬡ ${prefix}device
┋ ⬡ ${prefix}delsudo
┋ ⬡ ${prefix}getsudo
╰───────────────────⊷

『 ⚙️ Config 』
╭───────────────────⊷
┋ ⬡ ${prefix}online
┋ ⬡ ${prefix}welcome
┋ ⬡ ${prefix}goodbye
┋ ⬡ ${prefix}autotype
┋ ⬡ ${prefix}autoreact
┋ ⬡ ${prefix}setprefix
┋ ⬡ ${prefix}getconfig
┋ ⬡ ${prefix}statuslike
┋ ⬡ ${prefix}autorecord
┋ ⬡ ${prefix}chreact
┋ ⬡ ${prefix}autoview
┋ ⬡ ${prefix}likeemoji
┋ ⬡ ${prefix}private
┋ ⬡ ${prefix}public
╰───────────────────⊷

『 👥 Group 』
╭───────────────────⊷
┋ ⬡ ${prefix}delete
┋ ⬡ ${prefix}bye
┋ ⬡ ${prefix}kick
┋ ⬡ ${prefix}add
┋ ⬡ ${prefix}purge
┋ ⬡ ${prefix}mute
┋ ⬡ ${prefix}unmute
┋ ⬡ ${prefix}promote
┋ ⬡ ${prefix}demote
┋ ⬡ ${prefix}gclink
┋ ⬡ ${prefix}antilink
┋ ⬡ ${prefix}kickall
┋ ⬡ ${prefix}promoteall
┋ ⬡ ${prefix}demoteall
┋ ⬡ ${prefix}groupstatus
┋ ⬡ ${prefix}creategc
╰───────────────────⊷

『 🎥 Media 』
╭───────────────────⊷
┋ ⬡ ${prefix}vv
┋ ⬡ ${prefix}take
┋ ⬡ ${prefix}save
┋ ⬡ ${prefix}photo
┋ ⬡ ${prefix}setpp
┋ ⬡ ${prefix}grtpp
┋ ⬡ ${prefix}toaudio
┋ ⬡ ${prefix}sticker
┋ ⬡ ${prefix}logo
┋ ⬡ ${prefix}aiimage
┋ ⬡ ${prefix}telegram
┋ ⬡ ${prefix}toimage
╰───────────────────⊷

『 🔍 Search 』
╭───────────────────⊷
┋ ⬡ ${prefix}ask <question>
┋ ⬡ ${prefix}wiki-en <topic>
┋ ⬡ ${prefix}wiki-fr <topic>
╰───────────────────⊷

『 📥 Download 』
╭───────────────────⊷
┋ ⬡ ${prefix}play
┋ ⬡ ${prefix}tiktok
┋ ⬡ ${prefix}ig
┋ ⬡ ${prefix}apk
┋ ⬡ ${prefix}song
┋ ⬡ ${prefix}video
┋ ⬡ ${prefix}video1
┋ ⬡ ${prefix}fb
╰───────────────────⊷

『 🆕 New 』
╭───────────────────⊷
┋ ⬡ ${prefix}jid
┋ ⬡ ${prefix}groupinfo
┋ ⬡ ${prefix}admins
┋ ⬡ ${prefix}members
┋ ⬡ ${prefix}botinfo
┋ ⬡ ${prefix}calc
┋ ⬡ ${prefix}quote
┋ ⬡ ${prefix}help
╰───────────────────⊷

『 🏷️ Tags 』
╭───────────────────⊷
┋ ⬡ ${prefix}tag
┋ ⬡ ${prefix}tagadmin
┋ ⬡ ${prefix}tagall
┋ ⬡ ${prefix}settag
┋ ⬡ ${prefix}response
╰───────────────────⊷
`;

    const commandCount = (menuBody.match(/┋ ⬡/g) || []).length;

    const t = `
*╭┈───〔${BOT_NAME}  〕┈───⊷*
*├✦ Owner:* ${OWNER_NAME}
*├✦ Commands:* ${commandCount}
*├✦ Runtime:* ${runtime}
*├✦ Prefix:* ${prefix}
*├✦ Mode:* ${modeLabel}
*├✦ Version:* 1.0.0
*╰───────────────────⊷*
${menuBody}
📤 *Status saver:* reply *send*, *sendme* or *save* to a status (owner only)

https://zynex-pair-code.up.railway.app

*⟪ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝙺𝙰𝙸𝚁𝙾 〆 𝙳𝙴𝚅 ⟫*
    `
;

    const imagePath = path.join(process.cwd(), 'menu.jpg');

    if (fs.existsSync(imagePath)) {
        await client.sendMessage(remoteJid, { image: fs.readFileSync(imagePath), caption: t }, { quoted: message });
    } else {
        await client.sendMessage(remoteJid, { text: t }, { quoted: message });
    }

    const audioPath = path.join(process.cwd(), 'menu.mp3');

    if (fs.existsSync(audioPath)) {
        try {
            await client.sendMessage(remoteJid, {
                audio: fs.readFileSync(audioPath),
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: message });
        } catch (e) {
            console.log('[menu] audio failed:', e?.message || e);
        }
    }
}   

export default info;
