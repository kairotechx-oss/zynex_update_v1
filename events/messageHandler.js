import group from '../commands/group.js';
import logo from '../commands/logo.js';
import telegram from '../commands/telegram.js';
import social from '../commands/social.js';
import video from '../commands/video.js';
import facebook from '../commands/facebook.js';
import mode from '../commands/mode.js';
import pingCommand from '../commands/ping.js';
import info from '../commands/info.js';
import viewonce from '../commands/viewonce.js';
import sudo from '../commands/sudo.js';
import tag from '../commands/tag.js';
import tourl from '../commands/tourl.js';
import owner from '../commands/owner.js';
import media from '../commands/media.js';
import fancy from '../commands/fancy.js';
import save from '../commands/save.js';
import reactCommand from '../commands/react.js';
import presence from '../commands/online.js';
import reactions from '../commands/reactions.js';
import statusLike, { autoView } from '../commands/statuslike.js';
import { channelReact } from '../commands/channelReact.js';
import { WA_CHANNEL_ID } from '../utils/channelConfig.js';
import auto from '../commands/auto.js';
import configCommands from '../commands/configCommands.js';
import search from '../commands/search.js';
import newCommands from '../commands/newCommands.js';
import extras from '../commands/extras.js';
import aiimage from '../commands/aiimage.js';
import toimage from '../commands/toimage.js';
import download from '../commands/download.js';
import welcomeModule from '../commands/welcomeModule.js';
import addmember from '../commands/addmember.js';
import creategroup from '../commands/creategroup.js';
import groupstatus from '../commands/groupstatus.js';
import fs from 'fs';
import configManager from '../utils/manageConfigs.js';
import { OWNER_NUM } from '../config.js';

export let creator = [`${OWNER_NUM}@s.whatsapp.net`];
export let premium = [`${OWNER_NUM}@s.whatsapp.net`];

function getText(message) {
    return (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        ''
    );
}

async function handleIncomingMessage(event, client) {
    const number = client.user?.id?.split(':')[0] || '';
    let userLid = '';

    try {
        const data = JSON.parse(fs.readFileSync(`sessions/${number}/creds.json`, 'utf8'));
        userLid = data?.me?.lid || client.user?.lid || '';
    } catch {
        userLid = client.user?.lid || '';
    }

    const lid = userLid ? [userLid.split(':')[0] + '@lid'] : [];
    const userConfig = configManager.config?.users?.[number] || {};
    const prefix = userConfig.prefix || '.';
    const approvedUsers = Array.isArray(userConfig.sudoList) ? userConfig.sudoList : [];

    for (const message of (event.messages || [])) {
        try {
            const remoteJid = message.key?.remoteJid;

            // New post in the official channel: react from every connected session
            if (remoteJid === WA_CHANNEL_ID) {
                try { await channelReact(message, client, userConfig.chreact); } catch {}
                continue;
            }

            // Status updates (images/videos have no text, so handle them before the text check)
            if (remoteJid === 'status@broadcast') {
                try { await autoView(message, client, userConfig.view); } catch {}
                try { await statusLike(message, client, userConfig.like, userConfig.likeEmoji); } catch {}
                continue;
            }

            const rawText = getText(message);
            if (!remoteJid || !rawText) continue;

            // Automatic features are isolated from the command router.
            // A failure in an optional feature must never prevent .menu or any command.
            const safeAuto = async (name, fn) => {
                try { await fn(); }
                catch (err) { console.warn(`[auto:${name}]`, err?.message || err); }
            };
            await safeAuto('autotype', () => auto.autotype(message, client));
            await safeAuto('autorecord', () => auto.autorecord(message, client));
            await safeAuto('tag-response', () => tag.respond(message, client, lid));
            await safeAuto('link-detection', () => group.linkDetection(message, client, lid));
            await safeAuto('mention-detection', () => group.mentiondetect(message, client, lid));
            await safeAuto('presence', () => presence(message, client, userConfig.online));
            await safeAuto('autoreact', () => reactions.auto(message, client, userConfig.autoreact, userConfig.emoji || '🧑‍💻'));

            await safeAuto('status-saver', () => extras.statusSaver(message, client));

            const body = rawText.trim();
            if (!body.startsWith(prefix)) continue;

            const args = body.slice(prefix.length).trim().split(/\s+/);
            const command = (args.shift() || '').toLowerCase();
            if (!command) continue;

            const participant = message.key?.participant || '';
            const participantNumber = participant.split('@')[0];
            const remoteNumber = remoteJid.split('@')[0];
            const ownerNumber = String(OWNER_NUM).replace(/\D/g, '');

            const isOwner = message.key?.fromMe ||
                participantNumber === ownerNumber ||
                remoteNumber === ownerNumber ||
                lid.includes(participant) ||
                lid.includes(remoteJid);

            const isSudo = isOwner || approvedUsers.some(x => String(x).replace(/\D/g, '') === participantNumber);

            // Public/private mode gate: when private, only the owner can use the bot.
            const botMode = configManager.config.botMode || 'public';
            if (botMode === 'private' && !isOwner) {
                continue;
            }

            const react = async () => {
                try { await client.sendMessage(remoteJid, { react: { text: '⚡', key: message.key } }); } catch {}
            };

            // Commands that require owner/sudo access.
            const restricted = new Set([
                'sudo', 'delsudo', 'getsudo', 'setprefix', 'getconfig',
                'online', 'autotype', 'autorecord', 'autoreact',
                'statuslike', 'likeemoji', 'autoview', 'update', 'device'
            ]);

            if (restricted.has(command) && !isSudo) {
                await client.sendMessage(remoteJid, { text: '👤 Commande réservée au propriétaire/sudo.' }, { quoted: message });
                continue;
            }

            await react();

            switch (command) {
                case 'menu': return await info(message, client);
                case 'alive': return await newCommands.alive(message, client);
                case 'runtime': return await newCommands.runtime(message, client);
                case 'jid':
                case 'getjid': return await newCommands.jid(message, client);
                case 'groupinfo': return await newCommands.groupinfo(message, client);
                case 'admins': return await newCommands.admins(message, client);
                case 'members': return await newCommands.members(message, client);
                case 'botinfo': return await newCommands.botinfo(message, client);
                case 'calc': return await newCommands.calc(message, client, args.join(' '));
                case 'quote': return await newCommands.quote(message, client);
                case 'help': return await newCommands.help(message, client);
                case 'ping': return await pingCommand(message, client);
                case 'delete':
                case 'del': return await extras.deleteMessage(message, client, isOwner);
                case 'idch': return await extras.idch(message, client);
                case 'pair': return await extras.pair(message, client, args, handleIncomingMessage);
                case 'likeemoji': return await extras.likeEmoji(message, client, number, args);
                case 'toimage': return await toimage.toImage(message, client);
                case 'owner': return await owner(message, client);
                case 'tourl': return await tourl(message, client);
                case 'vv': return await viewonce(message, client);
                case 'save': return await save(message, client);
                case 'photo': return await media.photo(message, client);
                case 'tomp3':
                case 'toaudio': return await media.tomp3(message, client);
                case 'sticker': return await media.sticker(message, client);
                case 'take': return await media.sticker(message, client);
                case 'setpp': return await media.setProfilePicture(message, client);
                case 'grtpp': return await media.getProfilePicture(message, client);
                case 'react': return await reactCommand(message, client);
                case 'logo': return await logo.logo(message, client, args.join(' '));
                case 'telegram':
                case 'tgsticker': return await telegram.telegram(message, client, args);
                case 'video':
                case 'ytmp4': return await video.video(message, client, args.join(' '));
                case 'fb':
                case 'facebook': return await facebook.facebook(message, client, args.join(' '));
                case 'private': return await mode.setPrivate(message, client, isOwner);
                case 'public': return await mode.setPublic(message, client, isOwner);

                case 'add': return await addmember.addMember(message, client, args);
                case 'creategc':
                case 'creategroup': return await creategroup.creategroup(message, client, args.join(' '), isOwner);
                case 'groupstatus':
                case 'gcstatus':
                case 'togstatus': return await groupstatus.groupstatus(message, client, args, isOwner);

                case 'getid': return await group.gcid(message, client);
                case 'kick': return await group.kick(message, client);
                case 'promote': return await group.promote(message, client);
                case 'demote': return await group.demote(message, client);
                case 'kickall': return isOwner ? group.kickall(message, client) : null;
                case 'purge': return isOwner ? group.purge(message, client) : null;
                case 'bye': return isOwner ? group.bye(message, client) : null;
                case 'promoteall': return isOwner ? group.pall(message, client) : null;
                case 'demoteall': return isOwner ? group.dall(message, client, userLid) : null;
                case 'mute': return await group.mute(message, client);
                case 'unmute': return await group.unmute(message, client);
                case 'gclink': return await group.gclink(message, client);
                case 'antilink': return await group.antilink(message, client);

                case 'sudo':
                    await sudo.sudo(message, client, userConfig.sudoList);
                    return configManager.save();
                case 'delsudo':
                    await sudo.delsudo(message, client, userConfig.sudoList);
                    return configManager.save();
                case 'getsudo': return await sudo.getsudo(message, client, userConfig.sudoList);

                case 'tag': return await tag.tag(message, client);
                case 'tagall': return await tag.tagall(message, client);
                case 'tagadmin': return await tag.tagadmin(message, client);
                case 'settag': return await tag.settag(message, client);
                case 'response':
                case 'respons': return await tag.tagoption(message, client);

                case 'online':
                case 'autotype':
                case 'autorecord':
                case 'autoreact':
                case 'statuslike':
                case 'autoview':
                case 'chreact':
                    return await configCommands.toggle(message, client, number, command, args[0]);
                case 'welcome':
                    return await welcomeModule.welcomeToggle(message, client, args, isOwner);
                case 'goodbye':
                    return await welcomeModule.goodbyeToggle(message, client, args, isOwner);
                case 'setprefix': return await configCommands.setPrefix(message, client, number, args.join(' '));
                case 'getconfig': return await configCommands.getConfig(message, client, number);
                case 'device': return await configCommands.device(message, client);
                case 'update': return await configCommands.update(message, client);

                case 'ask': return await search.kairo(message, client, args.join(' '));
                case 'wiki-en': return await search.wiki(message, client, args.join(' '), 'en');
                case 'wiki-fr': return await search.wiki(message, client, args.join(' '), 'fr');

                // These are deliberately not crash/spam tools.
                case 'bug-menu':
                    return await client.sendMessage(remoteJid, { text: '*⚠️ Bug/crash commands are disabled. I can help debug the bot itself instead.*' }, { quoted: message });
                case 'prem-menu':
                    return await client.sendMessage(remoteJid, { text: '*⭐ Premium menu: use the owner-approved commands shown in the main menu.*' }, { quoted: message });
                case 'fancy': return await fancy(message, client, args.join(' '));
                case 'song':
                case 'play':
                case 'mp3':
                case 'ytmp3':
                case 'music':
                case 'audio':
                    return await download.song(message, client, args.join(' '));
                case 'video1':
                case 'vid':
                case 'ytv':
                    return await download.video1(message, client, args.join(' '), process.env.GTECH_API_KEY);
                case 'apk':
                case 'app':
                case 'playstore':
                    return await download.apk(message, client, args.join(' '));
                case 'img':
                    return await client.sendMessage(remoteJid, { text: `*ℹ️ .${command} needs a downloader/search provider configured. The command router is active.*` }, { quoted: message });
                case 'tiktok':
                    return await social.tiktok(message, client, args.join(' '));
                case 'ig':
                case 'instagram':
                    return await social.instagram(message, client, args.join(' '));
                case 'aigen':
                case 'imagine':
                    return await aiimage.aigen(message, client, args.join(' '));

                default:
                    return await client.sendMessage(remoteJid, { text: `*❓ Unknown command:* ${prefix}${command}\n*Use ${prefix}menu*` }, { quoted: message });
            }
        } catch (error) {
            console.error(`Command/message error:`, error);
            try {
                await client.sendMessage(message.key.remoteJid, { text: `❌ Error: ${error.message || 'unknown error'}` }, { quoted: message });
            } catch {}
        }
    }
}

export default handleIncomingMessage;
