import configManager from '../utils/manageConfigs.js';

function ensure(number) {
    configManager.config.users ||= {};
    configManager.config.users[number] ||= {
        sudoList: [], prefix: '.', welcome: false, online: false,
        type: false, record: false, autoreact: false, like: false, view: false,
        response: true, emoji: '🤖'
    };
    return configManager.config.users[number];
}

export async function toggle(message, client, number, command, value = '') {
    const cfg = ensure(number);
    const key = {
        online: 'online',
        welcome: 'welcome',
        autotype: 'type',
        autorecord: 'record',
        autoreact: 'autoreact',
        statuslike: 'like',
        autoview: 'view'
    }[command];

    if (!key) return;
    if (!['on', 'off'].includes(String(value).toLowerCase())) {
        return client.sendMessage(message.key.remoteJid, { text: `*𝚄𝚂𝙰𝙶𝙴: .${command} on|off*` }, { quoted: message });
    }

    cfg[key] = String(value).toLowerCase() === 'on';
    configManager.save();
    await client.sendMessage(message.key.remoteJid, { text: `*✅ ${command}: ${cfg[key] ? 'ON' : 'OFF'}*` }, { quoted: message });
}

export async function setPrefix(message, client, number, value) {
    const cfg = ensure(number);
    const prefix = String(value || '').trim();
    if (!prefix || prefix.length > 3 || /\s/.test(prefix)) {
        return client.sendMessage(message.key.remoteJid, { text: '*𝚄𝚂𝙰𝙶𝙴: .setprefix <prefix> (1-3 chars)*' }, { quoted: message });
    }
    cfg.prefix = prefix;
    configManager.save();
    await client.sendMessage(message.key.remoteJid, { text: `*✅ 𝙿𝚁𝙴𝙵𝙸𝚇 𝚂𝙴𝚃 𝚃𝙾: ${prefix}*` }, { quoted: message });
}

export async function getConfig(message, client, number) {
    const cfg = ensure(number);
    const safe = { ...cfg, sudoList: cfg.sudoList || [] };
    await client.sendMessage(message.key.remoteJid, {
        text: '⚙️ Current config:\n' + JSON.stringify(safe, null, 2)
    }, { quoted: message });
}

export async function device(message, client) {
    const user = client.user || {};
    await client.sendMessage(message.key.remoteJid, {
        text: `📱 Device/session\nID: ${user.id || 'unknown'}\nName: ${user.name || 'unknown'}`
    }, { quoted: message });
}

export async function update(message, client) {
    await client.sendMessage(message.key.remoteJid, {
        text: '*ℹ️ Update command is connected. Deploy a new build/restart the service to update the bot.*'
    }, { quoted: message });
}

export default { toggle, setPrefix, getConfig, device, update };
