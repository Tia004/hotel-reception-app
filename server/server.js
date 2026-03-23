const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => res.status(200).send('pong'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── Persistence Helpers ────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const PINNED_FILE = path.join(DATA_DIR, 'pinned.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { console.error(`Failed to load ${file}:`, e.message); }
    return fallback;
}

function saveJSON(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data), 'utf8'); }
    catch (e) { console.error(`Failed to save ${file}:`, e.message); }
}

function saveMessages() {
    const obj = {};
    for (const [k, v] of channelMessages.entries()) obj[k] = v;
    saveJSON(MESSAGES_FILE, obj);
}
function savePinned() {
    const obj = {};
    for (const [k, v] of pinnedMessages.entries()) obj[k] = v;
    saveJSON(PINNED_FILE, obj);
}
function saveKnownUsers() {
    const obj = {};
    for (const [k, v] of allKnownUsers.entries()) obj[k] = v;
    saveJSON(USERS_FILE, obj);
}

// ─── Data Stores ───────────────────────────────────────────────────────────────
const users = new Map();          // socketId → { id, username, station, roomId, status }

// Load known users from disk or use defaults
const defaultUsers = {
    'admin': { username: 'admin', station: 'Amministratore', status: 'invisible', bio: '', profilePic: null },
    'reception1': { username: 'reception1', station: 'Reception Principale', status: 'invisible', bio: '', profilePic: null },
    'reception2': { username: 'reception2', station: 'Reception Secondaria', status: 'invisible', bio: '', profilePic: null },
    'mobile_lobby': { username: 'mobile_lobby', station: 'Telefono Hall', status: 'invisible', bio: '', profilePic: null },
};
const savedUsers = loadJSON(USERS_FILE, defaultUsers);
const allKnownUsers = new Map(Object.entries(savedUsers));
// Ensure all default users exist and all are invisible on server start
for (const [k, v] of Object.entries(defaultUsers)) {
    if (!allKnownUsers.has(k)) allKnownUsers.set(k, v);
    else allKnownUsers.get(k).status = 'invisible'; // reset on server restart
}

const rooms = new Map();          // roomId → { id, name, creatorName, peers, isTemp, chatMessages, deleteTimer }

// Hotel channel messages — load from disk
const HOTEL_CHANNELS = [
    'duchessa-generale', 'duchessa-media', 'duchessa-annunci',
    'blumen-generale', 'blumen-media', 'blumen-annunci',
    'santorsola-generale', 'santorsola-media', 'santorsola-annunci',
];
const savedMessages = loadJSON(MESSAGES_FILE, {});
const channelMessages = new Map();
const savedPinned = loadJSON(PINNED_FILE, {});
const pinnedMessages = new Map();

HOTEL_CHANNELS.forEach(ch => {
    channelMessages.set(ch, savedMessages[ch] || []);
    pinnedMessages.set(ch, savedPinned[ch] || []);
});

const MESSAGE_TTL = 48 * 60 * 60 * 1000; // 48 hours

// Auto-cleanup expired messages every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [chId, msgs] of channelMessages.entries()) {
        channelMessages.set(chId, msgs.filter(m => m.expiresAt > now));
    }
    saveMessages();
    console.log('[Cleanup] Expired messages removed');
}, 10 * 60 * 1000);

// Auto-save messages every 30 seconds
setInterval(() => {
    saveMessages();
    savePinned();
}, 30 * 1000);

// ─── Room Helpers ──────────────────────────────────────────────────────────────
function broadcastRooms() {
    // Send ALL rooms (not just available ones) with peer info
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        creatorName: r.creatorName,
        creatorStation: r.creatorStation,
        isTemp: r.isTemp,
        peerCount: r.peers.length,
        peers: r.peers.map(sid => {
            const u = users.get(sid);
            return u ? { username: u.username, profilePic: allKnownUsers.get(u.username)?.profilePic || null } : null;
        }).filter(Boolean),
    }));
    io.emit('rooms-update', roomList);
}

function broadcastUsers() {
    const list = Array.from(allKnownUsers.values());
    io.emit('online-users', list);
}

// Schedule room auto-delete when empty (only for temp rooms)
function scheduleRoomDelete(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isTemp) return; 
    if (room.deleteTimer) clearTimeout(room.deleteTimer);
    room.deleteTimer = setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.peers.length === 0) {
            rooms.delete(roomId);
            broadcastRooms();
            console.log(`[Room] Auto-deleted empty room ${roomId}`);
        }
    }, 2 * 60 * 1000); // 2 minutes
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // ── Auth ────────────────────────────────────────────────────────────────
    socket.on('join', (data) => {
        const { username, station } = data;
        // Enforce unique sessions
        for (const [sid, u] of users.entries()) {
            if (u.username === username && u.station === station) {
                io.to(sid).emit('force-disconnect', { reason: "Un altro dispositivo ha effettuato l'accesso con queste credenziali." });
                const old = io.sockets.sockets.get(sid);
                if (old) old.disconnect(true);
                users.delete(sid);
            }
        }
        users.set(socket.id, { id: socket.id, username, station, roomId: null, status: 'online' });
        
        // Update global known user dictionary — set to ONLINE when they join
        const known = allKnownUsers.get(username) || { username, station, bio: '', profilePic: null };
        known.profilePic = data.profilePic || known.profilePic;
        known.status = 'online';
        known.station = station;
        allKnownUsers.set(username, known);
        saveKnownUsers();

        broadcastRooms();
        broadcastUsers();
    });

    // ── Room Management ──────────────────────────────────────────────────────
    socket.on('create-room', ({ hotelId } = {}) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        // Redirect to fixed room based on hotelId or default to general
        let roomId = 'generale-voice';
        if (hotelId === 'duchessa') roomId = 'duchessa-voice';
        if (hotelId === 'blumen') roomId = 'blumen-voice';
        if (hotelId === 'santorsola') roomId = 'santorsola-voice';

        const room = rooms.get(roomId);
        if (room) {
            // If user already in another room, leave it
            if (user.roomId && user.roomId !== roomId) {
                const oldRoom = rooms.get(user.roomId);
                if (oldRoom) {
                    oldRoom.peers = oldRoom.peers.filter(id => id !== socket.id);
                    socket.to(user.roomId).emit('user-left-room', { socketId: socket.id });
                    socket.leave(user.roomId);
                }
            }
            
            if (!room.peers.includes(socket.id)) room.peers.push(socket.id);
            user.roomId = roomId;
            socket.join(roomId);
            socket.emit('room-joined', { roomId, peers: room.peers, isTemp: room.isTemp });
            socket.to(roomId).emit('user-joined-room', { socketId: socket.id, username: user.username });
            broadcastRooms();
        }
    });

    socket.on('join-room', ({ roomId }) => {
        const user = users.get(socket.id);
        const room = rooms.get(roomId);
        if (!user || !room) { socket.emit('room-error', { message: 'Stanza non trovata.' }); return; }
        // Cancel auto-delete timer if room was about to be deleted
        if (room.deleteTimer) { clearTimeout(room.deleteTimer); room.deleteTimer = null; }
        room.peers.push(socket.id);
        user.roomId = roomId;
        socket.join(roomId);
        socket.emit('room-joined', { roomId, peers: room.peers, isTemp: room.isTemp });
        socket.to(roomId).emit('user-joined-room', { socketId: socket.id, username: user.username });
        broadcastRooms();
    });

    socket.on('leave-room', () => {
        const user = users.get(socket.id);
        if (!user || !user.roomId) return;
        const roomId = user.roomId;
        const room = rooms.get(roomId);
        if (room) {
            room.peers = room.peers.filter(id => id !== socket.id);
            socket.to(roomId).emit('user-left-room', { socketId: socket.id });
            socket.leave(roomId);
            // Don't delete immediately — schedule auto-delete after 2min if empty
            if (room.peers.length === 0) {
                scheduleRoomDelete(roomId);
            }
        }
        user.roomId = null;
        broadcastRooms();
    });

    // ── WebRTC Signaling ────────────────────────────────────────────────────
    // Ensure sender field is always present
    socket.on('offer', (d) => io.to(d.target).emit('offer', { ...d, sender: socket.id }));
    socket.on('answer', (d) => io.to(d.target).emit('answer', { ...d, sender: socket.id }));
    socket.on('ice-candidate', (d) => io.to(d.target).emit('ice-candidate', { ...d, sender: socket.id }));

    // ── In-Call Media State ──────────────────────────────────────────────────
    socket.on('media-state-change', (data) => {
        const user = users.get(socket.id);
        if (user?.roomId) socket.to(user.roomId).emit('media-state-change', { socketId: socket.id, ...data });
    });

    socket.on('hand-raise', (data) => {
        const user = users.get(socket.id);
        if (user?.roomId) socket.to(user.roomId).emit('hand-raise', { socketId: socket.id, isRaised: data.isRaised });
    });

    // ── In-Call Chat (room chat, not hotel channels) ──────────────────────────
    socket.on('chat-message', (data) => {
        const user = users.get(socket.id);
        if (!user?.roomId) return;
        const room = rooms.get(user.roomId);
        const msgObj = { socketId: socket.id, sender: user.username, ...data, timestamp: Date.now() };
        // Save to room chat history (in-memory)
        if (room) room.chatMessages.push(msgObj);
        socket.to(user.roomId).emit('chat-message', msgObj);
    });

    // ── Persist in-call chat to disk ─────────────────────────────────────────
    socket.on('room-chat-save', ({ roomId, message }) => {
        if (!roomId || !message) return;
        const chatFile = path.join(DATA_DIR, `room_chat_${roomId}.json`);
        try {
            let history = [];
            if (fs.existsSync(chatFile)) history = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
            history.push({ ...message, timestamp: message.timestamp || Date.now() });
            // Keep max 200 messages per room
            if (history.length > 200) history = history.slice(-200);
            fs.writeFileSync(chatFile, JSON.stringify(history), 'utf8');
        } catch (e) { console.error('Failed to save room chat:', e.message); }
    });

    socket.on('room-chat-history', ({ roomId }) => {
        if (!roomId) return;
        const chatFile = path.join(DATA_DIR, `room_chat_${roomId}.json`);
        try {
            if (fs.existsSync(chatFile)) {
                const history = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
                socket.emit('room-chat-history', { messages: history });
            } else {
                socket.emit('room-chat-history', { messages: [] });
            }
        } catch (e) { socket.emit('room-chat-history', { messages: [] }); }
    });

    // List all saved chat archives
    socket.on('get-room-archives', () => {
        try {
            const files = fs.readdirSync(DATA_DIR);
            const archives = files
                .filter(f => f.startsWith('room_chat_') && f.endsWith('.json'))
                .map(f => {
                    const roomId = f.replace('room_chat_', '').replace('.json', '');
                    const stats = fs.statSync(path.join(DATA_DIR, f));
                    return { roomId, mtime: stats.mtimeMs };
                })
                .sort((a, b) => b.mtime - a.mtime);
            socket.emit('room-archives', { archives });
        } catch (e) { console.error('Archive list failed', e); }
    });

    // ── Emoji Reactions (in-call) ────────────────────────────────────────────
    socket.on('emoji-reaction', (data) => {
        const user = users.get(socket.id);
        if (user?.roomId) socket.to(user.roomId).emit('emoji-reaction', { socketId: socket.id, emoji: data.emoji });
    });

    // ── Hotel Channel Chat ────────────────────────────────────────────────────
    socket.on('join-channel', ({ channelId }) => {
        socket.join(`channel:${channelId}`);
    });

    socket.on('leave-channel', ({ channelId }) => {
        socket.leave(`channel:${channelId}`);
    });

    // Get history for a channel (messages not yet expired)
    socket.on('get-channel-history', ({ channelId }) => {
        const now = Date.now();
        const msgs = (channelMessages.get(channelId) || []).filter(m => m.expiresAt > now);
        const pinned = pinnedMessages.get(channelId) || [];
        socket.emit('channel-history', { channelId, messages: msgs, pinned });
    });

    // Send a message to a hotel channel
    socket.on('channel-message', ({ channelId, text, imageData, gifUrl, poll, voiceData, voiceDuration, replyTo }) => {
        const user = users.get(socket.id);
        if (!user || !HOTEL_CHANNELS.includes(channelId)) return;
        const now = Date.now();
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Get list of currently online usernames for deliveredTo
        const onlineUsersInfo = [];
        for (const u of users.values()) {
            if (u.username !== user.username) {
                onlineUsersInfo.push({ user: u.username, time: timeStr });
            }
        }
        
        const msg = {
            id: `${socket.id}-${now}`,
            sender: user.username,
            station: user.station,
            text: text || '',
            imageData: imageData || null,
            gifUrl: gifUrl || null,
            poll: poll ? { ...poll, votes: poll.votes || {}, isMultiple: poll.isMultiple || false } : null,
            voiceData: voiceData || null,
            voiceDuration: voiceDuration || 0,
            replyTo: replyTo || null,
            edited: false,
            timestamp: now,
            expiresAt: now + MESSAGE_TTL,
            pinned: false,
            reactions: {},
            // Read receipts
            status: 'sent',
            deliveredTo: onlineUsersInfo,
            readBy: [],
        };
        const msgs = channelMessages.get(channelId) || [];
        msgs.push(msg);
        channelMessages.set(channelId, msgs);
        saveMessages();
        io.to(`channel:${channelId}`).emit('channel-message', { channelId, message: msg });
    });

    // Mark messages as read
    socket.on('mark-read', ({ channelId, messageIds }) => {
        const user = users.get(socket.id);
        if (!user) return;
        const msgs = channelMessages.get(channelId);
        if (!msgs) return;
        let changed = false;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const receiptUpdate = [];

        for (const mid of messageIds) {
            const msg = msgs.find(m => m.id === mid);
            if (msg && msg.sender !== user.username && !msg.readBy?.some(r => r.user === user.username)) {
                if (!msg.readBy) msg.readBy = [];
                const receipt = { user: user.username, time: timeStr };
                msg.readBy.push(receipt);
                receiptUpdate.push({ messageId: mid, receipt });
                changed = true;
            }
        }
        if (changed) {
            // Broadcast updated read status
            io.to(`channel:${channelId}`).emit('read-receipt-update', { channelId, reader: user.username, receipts: receiptUpdate });
        }
    });

    socket.on('edit-message', ({ channelId, messageId, text }) => {
        const msgs = channelMessages.get(channelId);
        if (!msgs) return;
        const msg = msgs.find(m => m.id === messageId);
        if (!msg) return;
        msg.text = text;
        msg.edited = true;
        saveMessages();
        io.to(`channel:${channelId}`).emit('message-edited', { channelId, messageId, text });
    });

    socket.on('delete-message', ({ channelId, messageId }) => {
        const msgs = channelMessages.get(channelId);
        if (!msgs) return;
        const msgIdx = msgs.findIndex(m => m.id === messageId);
        if (msgIdx === -1) return;
        msgs.splice(msgIdx, 1);
        saveMessages();
        io.to(`channel:${channelId}`).emit('message-deleted', { channelId, messageId });
    });

    socket.on('react-message', ({ channelId, messageId, emoji }) => {
        const user = users.get(socket.id);
        if (!user) return;
        const msgs = channelMessages.get(channelId);
        if (!msgs) return;
        const msg = msgs.find(m => m.id === messageId);
        if (!msg) return;

        if (!msg.reactions) msg.reactions = {};
        
        // Ensure single reaction per user: remove user from any other emoji array
        for (const existingEmoji in msg.reactions) {
            if (existingEmoji !== emoji) {
                const userIdx = msg.reactions[existingEmoji].indexOf(user.username);
                if (userIdx > -1) {
                    msg.reactions[existingEmoji].splice(userIdx, 1);
                    if (msg.reactions[existingEmoji].length === 0) {
                        delete msg.reactions[existingEmoji];
                    }
                }
            }
        }

        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

        const idx = msg.reactions[emoji].indexOf(user.username);
        if (idx > -1) msg.reactions[emoji].splice(idx, 1);
        else msg.reactions[emoji].push(user.username);

        if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];

        saveMessages();
        io.to(`channel:${channelId}`).emit('message-reacted', { channelId, messageId, reactions: msg.reactions });
    });

    // Poll vote: toggle vote on an option
    socket.on('channel-poll-vote', ({ channelId, messageId, optionIndex }) => {
        const user = users.get(socket.id);
        if (!user) return;
        const msgs = channelMessages.get(channelId) || [];
        const msg = msgs.find(m => m.id === messageId);
        if (!msg || !msg.poll) return;
        const votes = msg.poll.votes || {};
        const userId = user.username;
        // Single choice: remove from all other options first
        if (!msg.poll.isMultiple) {
            Object.keys(votes).forEach(k => {
                if (parseInt(k) !== optionIndex) votes[k] = (votes[k] || []).filter(u => u !== userId);
            });
        }
        if (!votes[optionIndex]) votes[optionIndex] = [];
        const already = votes[optionIndex].includes(userId);
        if (already) { votes[optionIndex] = votes[optionIndex].filter(u => u !== userId); }
        else { votes[optionIndex].push(userId); }
        msg.poll.votes = votes;
        saveMessages();
        io.to(`channel:${channelId}`).emit('channel-poll-update', { channelId, messageId, votes });
    });

    // User presence / status broadcast
    socket.on('user-status', ({ status }) => {
        const user = users.get(socket.id);
        if (user) { 
            user.status = status; 
            if(allKnownUsers.has(user.username)) allKnownUsers.get(user.username).status = status;
            saveKnownUsers();
            broadcastUsers(); 
        }
    });
    socket.on('user-bio', ({ bio }) => {
        const user = users.get(socket.id);
        if (user) { 
            user.bio = bio; 
            if(allKnownUsers.has(user.username)) allKnownUsers.get(user.username).bio = bio;
            saveKnownUsers();
            broadcastUsers();
        }
    });


    // Pin / unpin a message
    socket.on('pin-message', ({ channelId, messageId }) => {
        const msgs = channelMessages.get(channelId) || [];
        const msg = msgs.find(m => m.id === messageId);
        if (!msg) return;
        msg.pinned = true;
        const pinned = pinnedMessages.get(channelId) || [];
        if (!pinned.find(p => p.id === messageId)) pinned.push(msg);
        pinnedMessages.set(channelId, pinned);
        saveMessages();
        savePinned();
        io.to(`channel:${channelId}`).emit('message-pinned', { channelId, message: msg });
    });

    socket.on('unpin-message', ({ channelId, messageId }) => {
        const msgs = channelMessages.get(channelId) || [];
        const msg = msgs.find(m => m.id === messageId);
        if (msg) msg.pinned = false;
        const pinned = (pinnedMessages.get(channelId) || []).filter(p => p.id !== messageId);
        pinnedMessages.set(channelId, pinned);
        saveMessages();
        savePinned();
        io.to(`channel:${channelId}`).emit('message-unpinned', { channelId, messageId });
    });

    // React to a message in a hotel channel (legacy - unused, kept for compat)
    socket.on('channel-reaction', ({ channelId, messageId, emoji }) => {
        const msgs = channelMessages.get(channelId) || [];
        const msg = msgs.find(m => m.id === messageId);
        if (!msg) return;
        msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
        io.to(`channel:${channelId}`).emit('channel-reaction-update', { channelId, messageId, emoji, count: msg.reactions[emoji] });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            if (user.roomId) {
                const room = rooms.get(user.roomId);
                if (room) {
                    room.peers = room.peers.filter(id => id !== socket.id);
                    socket.to(user.roomId).emit('user-left-room', { socketId: socket.id });
                    // Don't delete immediately — schedule auto-delete
                    if (room.peers.length === 0) {
                        scheduleRoomDelete(user.roomId);
                    }
                }
            }
            users.delete(socket.id);
            if (allKnownUsers.has(user.username)) {
                // Tab closed = idle (orange). After some time the client can set offline explicitly.
                allKnownUsers.get(user.username).status = 'idle';
                saveKnownUsers();
            }
            broadcastRooms();
            broadcastUsers();
        }
        console.log(`Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
