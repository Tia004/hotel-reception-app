const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
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

// ─── Data Stores ───────────────────────────────────────────────────────────────
const users = new Map();          // socketId → { id, username, station, roomId }
const rooms = new Map();          // roomId → { id, name, creatorName, peers, isTemp }

// Hotel channel messages: channelId → [{ id, sender, text, timestamp, expiresAt, pinned, reactions }]
const channelMessages = new Map();
const pinnedMessages = new Map(); // channelId → [message]

const HOTEL_CHANNELS = [
    'duchessa-generale', 'duchessa-media', 'duchessa-annunci',
    'blumen-generale', 'blumen-media', 'blumen-annunci',
    'santorsola-generale', 'santorsola-media', 'santorsola-annunci',
];
HOTEL_CHANNELS.forEach(ch => {
    channelMessages.set(ch, []);
    pinnedMessages.set(ch, []);
});

const MESSAGE_TTL = 48 * 60 * 60 * 1000; // 48 hours

// Auto-cleanup expired messages every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [chId, msgs] of channelMessages.entries()) {
        channelMessages.set(chId, msgs.filter(m => m.expiresAt > now));
    }
    console.log('[Cleanup] Expired messages removed');
}, 10 * 60 * 1000);

// ─── Room Helpers ──────────────────────────────────────────────────────────────
function broadcastRooms() {
    const available = Array.from(rooms.values()).filter(r => r.peers.length < 2);
    io.emit('rooms-update', available);
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
        users.set(socket.id, { id: socket.id, username, station, roomId: null });
        broadcastRooms();
    });

    // ── Room Management ──────────────────────────────────────────────────────
    socket.on('create-room', ({ isTemp = false } = {}) => {
        const user = users.get(socket.id);
        if (!user) return;
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms.set(roomId, {
            id: roomId,
            name: `Stanza di ${user.username}`,
            creatorName: user.username,
            creatorStation: user.station,
            peers: [socket.id],
            isTemp,
            chatMessages: [],   // in-call chat, optional persistence
        });
        user.roomId = roomId;
        socket.join(roomId);
        socket.emit('room-created', { roomId, isTemp });
        broadcastRooms();
    });

    socket.on('join-room', ({ roomId }) => {
        const user = users.get(socket.id);
        const room = rooms.get(roomId);
        if (!user || !room) { socket.emit('room-error', { message: 'Stanza non trovata.' }); return; }
        if (room.peers.length >= 2) { socket.emit('room-error', { message: 'Stanza al completo.' }); return; }
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
            if (room.peers.length === 0) rooms.delete(roomId);
        }
        user.roomId = null;
        broadcastRooms();
    });

    // ── WebRTC Signaling ────────────────────────────────────────────────────
    socket.on('offer', (d) => io.to(d.target).emit('offer', d));
    socket.on('answer', (d) => io.to(d.target).emit('answer', d));
    socket.on('ice-candidate', (d) => io.to(d.target).emit('ice-candidate', d));

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
        // socket.to → excludes sender, so no double message
        socket.to(user.roomId).emit('chat-message', {
            socketId: socket.id,
            sender: user.username,
            ...data
        });
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
    socket.on('channel-message', ({ channelId, text, imageData, gifUrl, poll }) => {
        const user = users.get(socket.id);
        if (!user || !HOTEL_CHANNELS.includes(channelId)) return;
        const now = Date.now();
        const msg = {
            id: `${socket.id}-${now}`,
            sender: user.username,
            station: user.station,
            text: text || '',
            imageData: imageData || null,
            gifUrl: gifUrl || null,
            poll: poll || null,
            timestamp: now,
            expiresAt: now + MESSAGE_TTL,
            pinned: false,
            reactions: {},
        };
        const msgs = channelMessages.get(channelId) || [];
        msgs.push(msg);
        channelMessages.set(channelId, msgs);
        // Broadcast to EVERYONE in this channel room (including sender for consistency)
        io.to(`channel:${channelId}`).emit('channel-message', { channelId, message: msg });
    });

    // User presence / status broadcast
    socket.on('user-status', ({ status }) => {
        const user = users.get(socket.id);
        if (user) { user.status = status; io.emit('user-status-update', { socketId: socket.id, username: user.username, status }); }
    });
    socket.on('user-bio', ({ bio }) => {
        const user = users.get(socket.id);
        if (user) { user.bio = bio; }
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
        io.to(`channel:${channelId}`).emit('message-pinned', { channelId, message: msg });
    });

    socket.on('unpin-message', ({ channelId, messageId }) => {
        const msgs = channelMessages.get(channelId) || [];
        const msg = msgs.find(m => m.id === messageId);
        if (msg) msg.pinned = false;
        const pinned = (pinnedMessages.get(channelId) || []).filter(p => p.id !== messageId);
        pinnedMessages.set(channelId, pinned);
        io.to(`channel:${channelId}`).emit('message-unpinned', { channelId, messageId });
    });

    // React to a message in a hotel channel
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
                    if (room.peers.length === 0) rooms.delete(user.roomId);
                }
            }
            users.delete(socket.id);
            broadcastRooms();
        }
        console.log(`Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
