import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import fs from 'fs';
import autoJoin from './autoJoin.js';
import { WA_CHANNEL_ID } from './channelConfig.js';
import configManager from './manageConfigs.js';
import welcomeModule from '../commands/welcomeModule.js';

// On Railway the container filesystem is wiped on every redeploy/restart.
// Mount a Volume (e.g. at /data) and set DATA_DIR=/data so sessions survive.
const DATA_DIR = process.env.DATA_DIR || '.';
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const SESSIONS_FILE = `${DATA_DIR}/sessions.json`;
const AUTH_DIR = `${DATA_DIR}/auth_info`;

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

// Follow the official channel and keep the live-updates subscription alive so
// new channel posts reach this session (needed for channel auto-react).
async function setupChannel(sock) {
    try { await autoJoin(sock); } catch (e) { console.error('autoJoin:', e?.message || e); }

    const subscribe = async () => {
        try {
            if (typeof sock.subscribeNewsletterUpdates === 'function') {
                await sock.subscribeNewsletterUpdates(WA_CHANNEL_ID);
            }
        } catch (e) { console.log('[channel] subscribe failed:', e?.message || e); }
    };
    await subscribe();
    clearInterval(sock._channelTimer);
    sock._channelTimer = setInterval(subscribe, 4 * 60 * 1000);
}

// ─── Disk cleanup (fixes "ENOSPC: no space left on device") ─────────────────
// Baileys keeps creating small key files for every group/contact it talks to,
// and every abandoned pairing attempt leaves a whole folder behind. On a small
// Railway volume this fills the disk, after which NO new number can pair and
// existing sessions can end up with corrupted creds.
export function cleanupAuthDir({ force = false } = {}) {
    const DAY = 24 * 60 * 60 * 1000;
    const unpairedMaxAge = force ? 2 * 60 * 1000 : 30 * 60 * 1000;
    const senderKeyMaxAge = force ? 1 * DAY : 7 * DAY;
    const now = Date.now();
    let removedDirs = 0;
    let removedFiles = 0;

    let dirs = [];
    try { dirs = fs.readdirSync(AUTH_DIR); } catch { return { removedDirs, removedFiles }; }

    for (const dir of dirs) {
        const full = `${AUTH_DIR}/${dir}`;
        try {
            if (!fs.statSync(full).isDirectory()) continue;

            let registered = false;
            try { registered = !!JSON.parse(fs.readFileSync(`${full}/creds.json`, 'utf8')).registered; } catch {}

            // Never paired (or unreadable) and old enough: abandoned attempt
            if (!registered) {
                if (now - fs.statSync(full).mtimeMs > unpairedMaxAge && !sessions[dir]?.user) {
                    fs.rmSync(full, { recursive: true, force: true });
                    removedDirs++;
                }
                continue;
            }

            // Paired session: drop old sender-key files (they are re-created on demand)
            for (const file of fs.readdirSync(full)) {
                if (!file.startsWith('sender-key-')) continue;
                try {
                    if (now - fs.statSync(`${full}/${file}`).mtimeMs > senderKeyMaxAge) {
                        fs.rmSync(`${full}/${file}`, { force: true });
                        removedFiles++;
                    }
                } catch {}
            }
        } catch {}
    }

    if (removedDirs || removedFiles) {
        console.log(`🧹 Disk cleanup: ${removedDirs} abandoned folder(s), ${removedFiles} old key file(s) removed.`);
    }
    return { removedDirs, removedFiles };
}

setInterval(() => { try { cleanupAuthDir(); } catch {} }, 30 * 60 * 1000).unref();

export async function startSession(targetNumber, handler, makePrimary = true, onPairingCode = () => {}, isReconnect = false, onConnected = () => {}) {
    const number = normalizeNumber(targetNumber);
    if (!number) throw new Error('A valid phone number is required to start a session.');

    let authState;
    try {
        authState = await useMultiFileAuthState(`${AUTH_DIR}/${number}`);
    } catch (err) {
        if (err?.code !== 'ENOSPC') throw err;
        console.error('💾 Disk full while creating the session folder, cleaning up and retrying...');
        cleanupAuthDir({ force: true });
        try {
            authState = await useMultiFileAuthState(`${AUTH_DIR}/${number}`);
        } catch (err2) {
            throw new Error('Server disk is full. Increase the Railway volume size or delete old sessions.');
        }
    }
    const { state, saveCreds } = authState;
    const { version: fetchedVersion } = await fetchLatestBaileysVersion();
    const version = pickVersion(fetchedVersion);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        keepAliveIntervalMs: 25000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 500,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
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
            sessions[number] = sessions[number] || { sock, user: null };
            sessions[number].sock = sock;
            sessions[number].user = sock.user;
            sessions[number].retries = 0;
            saveSessionNumber(number);

            if (makePrimary) {
                configManager.config.users = configManager.config.users || {};
                configManager.config.users.root = configManager.config.users.root || {};
                configManager.config.users.root.primary = number;
                configManager.save();
            }

            console.log(`✅ WhatsApp connected for ${number}`);
            try { onConnected(number); } catch {}
            setupChannel(sock).catch(() => {});
        }

        if (connection === 'close') {
            clearInterval(sock._channelTimer);
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.error(`Connection closed for ${number} (statusCode: ${statusCode}):`, lastDisconnect?.error?.message || lastDisconnect?.error);

            // Drop the dead socket completely so listeners/timers never pile up.
            try { sock.ev.removeAllListeners(); } catch {}
            try { sock.end(undefined); } catch {}

            // If this socket was already replaced by a newer one, do nothing.
            if (sessions[number]?.sock !== sock) return;

            // Pairing never completed (wrong/expired code...): free the folder
            // instead of reconnecting forever and filling the disk.
            if (!sock.authState?.creds?.registered && statusCode !== DisconnectReason.restartRequired) {
                console.log(`🧹 Pairing for ${number} was not completed, removing its folder.`);
                delete sessions[number];
                try { fs.rmSync(`${AUTH_DIR}/${number}`, { recursive: true, force: true }); } catch {}
                return;
            }

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`🚪 Session ${number} logged out.`);
                delete sessions[number];
                removeSessionNumber(number);
                return;
            }

            if (statusCode === DisconnectReason.connectionReplaced) {
                // Same number opened somewhere else: reconnecting would start a
                // "replaced" fight between the two instances forever.
                console.log(`⚠️ Session ${number} was replaced by another login. Not reconnecting.`);
                delete sessions[number];
                return;
            }

            const entry = sessions[number];
            entry.user = null;
            entry.retries = (entry.retries || 0) + 1;

            // 515 = "restart required" right after pairing: reconnect immediately.
            const delay = statusCode === DisconnectReason.restartRequired
                ? 500
                : Math.min(60000, 2000 * 2 ** Math.min(entry.retries, 5));

            console.log(`♻️ Reconnecting session ${number} in ${Math.round(delay / 1000)}s (attempt ${entry.retries})...`);
            setTimeout(() => {
                if (sessions[number]?.sock !== sock) return;
                const retries = entry.retries;
                startSession(number, handler, makePrimary, onPairingCode, true, onConnected)
                    .then(() => { if (sessions[number]) sessions[number].retries = retries; })
                    .catch((e) => console.error(`Reconnect failed for ${number}:`, e.message));
            }, delay);
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        // A freshly linked account receives hundreds of old messages (type
        // 'append'). Processing them spikes memory/CPU, can crash the whole
        // process (everyone goes offline) and replays old commands.
        if (msg?.type === 'append') return;
        try { await handler(msg, sock); }
        catch (e) { console.error('Message handler error:', e.message); }
    });

    sock.ev.on('group-participants.update', async (update) => {
        try { await welcomeModule.handleGroupUpdate(update, sock); }
        catch (e) { console.error('[welcome/goodbye]', e?.message || e); }
    });

    return sock;
}

// Bring every saved session back online after a restart/redeploy.
export async function restoreSessions(handler, { batchSize = 5, pauseMs = 3000 } = {}) {
    try { cleanupAuthDir({ force: true }); } catch {}
    const numbers = new Set(loadSessionNumbers());

    try {
        for (const dir of fs.readdirSync(AUTH_DIR)) {
            try {
                const creds = JSON.parse(fs.readFileSync(`${AUTH_DIR}/${dir}/creds.json`, 'utf8'));
                if (creds?.registered) numbers.add(dir);
            } catch {}
        }
    } catch {}

    const list = [...numbers].filter((n) => n && !sessions[n]);
    console.log(`🔄 Restoring ${list.length} saved session(s)...`);

    for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        await Promise.all(batch.map((n) =>
            startSession(n, handler, false, () => {}, true, () => {})
                .catch((e) => console.error(`Restore failed for ${n}:`, e?.message || e))
        ));
        await new Promise((r) => setTimeout(r, pauseMs));
    }
    console.log('✅ Session restore finished.');
}

export default startSession;
