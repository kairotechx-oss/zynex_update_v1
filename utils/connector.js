import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import fs from 'fs';
import configManager from './manageConfigs.js';
import welcomeModule from '../commands/welcomeModule.js';

const SESSIONS_FILE = 'sessions.json';
const AUTH_DIR = 'auth_info';

// Floor for the WA web version: fetchLatestBaileysVersion() can return a
// cached/stale value from Baileys' bundled data. WhatsApp periodically
// rejects connections using an outdated version with a "Connection Failure"
// during login. If the fetched version is older than this floor, use the
// floor instead. Bump this if pairing starts failing again after a WhatsApp
// server-side update.
const MIN_WA_VERSION = [2, 3000, 1044015310];

function pickVersion(fetched) {
    for (let i = 0; i < 3; i++) {
        if (fetched[i] > MIN_WA_VERSION[i]) return fetched;
        if (fetched[i] < MIN_WA_VERSION[i]) return MIN_WA_VERSION;
    }
    return fetched;
}

// number -> { sock, user }
const sessions = {};

function normalizeNumber(value) {
    return String(value || '').replace(/\D/g, '');
}

function loadSessionNumbers() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
            return Array.isArray(data.sessions) ? data.sessions : [];
        }
    } catch {}
    return [];
}

function saveSessionNumber(number) {
    let list = loadSessionNumbers();
    if (!list.includes(number)) {
        list.push(number);
        try {
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: list }, null, 2));
        } catch (e) {
            console.error('Could not persist sessions.json:', e.message);
        }
    }
}

function removeSessionNumber(number) {
    const list = loadSessionNumbers().filter((n) => n !== number);
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: list }, null, 2));
    } catch (e) {
        console.error('Could not update sessions.json:', e.message);
    }
}

export function getSession(number) {
    return sessions[normalizeNumber(number)];
}

export function listSessionNumbers() {
    return Object.keys(sessions).filter((n) => sessions[n]?.sock?.user);
}

export async function logoutSession(number) {
    const num = normalizeNumber(number);
    const entry = sessions[num];

    try {
        if (entry?.sock) {
            try { await entry.sock.logout(); } catch {}
            try { entry.sock.end(new Error('Logged out by user')); } catch {}
        }
    } finally {
        delete sessions[num];
        removeSessionNumber(num);

        try {
            fs.rmSync(`${AUTH_DIR}/${num}`, { recursive: true, force: true });
        } catch (e) {
            console.error('Could not clear auth folder:', e.message);
        }

        if (configManager.config?.users?.root?.primary === num) {
            delete configManager.config.users.root.primary;
            configManager.save();
        }
    }
}

export async function startSession(targetNumber, handler, makePrimary = true, onPairingCode = () => {}, isReconnect = false, onConnected = () => {}) {
    const number = normalizeNumber(targetNumber);
    if (!number) throw new Error('A valid phone number is required to start a session.');

    const { state, saveCreds } = await useMultiFileAuthState(`${AUTH_DIR}/${number}`);
    const { version: fetchedVersion } = await fetchLatestBaileysVersion();
    const version = pickVersion(fetchedVersion);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
    });

    sessions[number] = { sock, user: null };

    sock.ev.on('creds.update', saveCreds);

    // requestPairingCode must not be called right away: the socket needs a
    // moment to finish its initial handshake with WhatsApp's servers first.
    // Calling it too early makes WhatsApp reply with a 428 error that shows
    // up as "Connection Closed" (a well-known Baileys pitfall).
    async function requestCodeWhenReady() {
        if (isReconnect || state.creds.registered) return;

        await new Promise((resolve) => setTimeout(resolve, 3000));

        try {
            const code = await sock.requestPairingCode(number);
            onPairingCode(code, number, null);
        } catch (err) {
            console.error(`Pairing code request failed for ${number}:`, err?.message, err?.stack);
            onPairingCode(null, number, err);
        }
    }
    requestCodeWhenReady();

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            sessions[number].user = sock.user;
            saveSessionNumber(number);

            if (makePrimary) {
                configManager.config.users = configManager.config.users || {};
                configManager.config.users.root = configManager.config.users.root || {};
                configManager.config.users.root.primary = number;
                configManager.save();
            }

            console.log(`✅ WhatsApp connected for ${number}`);
            try { onConnected(number); } catch {}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.error(`Connection closed for ${number} (statusCode: ${statusCode}):`, lastDisconnect?.error?.message || lastDisconnect?.error);

            if (shouldReconnect) {
                console.log(`♻️ Reconnecting session ${number}...`);
                startSession(number, handler, makePrimary, onPairingCode, true, onConnected).catch((e) =>
                    console.error(`Reconnect failed for ${number}:`, e.message)
                );
            } else {
                console.log(`🚪 Session ${number} logged out.`);
                delete sessions[number];
                removeSessionNumber(number);
            }
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        try { await handler(msg, sock); }
        catch (e) { console.error('Message handler error:', e.message); }
    });

    sock.ev.on('group-participants.update', async (update) => {
        try { await welcomeModule.handleGroupUpdate(update, sock); }
        catch (e) { console.error('[welcome/goodbye]', e?.message || e); }
    });

    return sock;
}

export default startSession;
