const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Necessario per load-balancer HTTPS come Render
app.use(cors());

// Serve a un semplice ping dal frontend per svegliare il server Render se è in sleep
app.get('/ping', (req, res) => res.status(200).send('pong'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store connected users. Map of socket.id -> { id, username, station, roomId }
const users = new Map();
// Store active rooms. Map of roomId -> { id, name, creatorName, peers: [socketId] }
const rooms = new Map();

function broadcastRooms() {
    // Convert rooms map to array for the lobby, filtering out full rooms (max 2 for now to ensure 1v1 stability)
    const availableRooms = Array.from(rooms.values()).filter(r => r.peers.length < 2);
    io.emit('rooms-update', availableRooms);
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // When a user logs in
    socket.on('join', (data) => {
        const { username, station } = data;

        // Enforce unique sessions
        for (const [existingSocketId, user] of users.entries()) {
            if (user.username === username && user.station === station) {
                console.log(`Duplicate session detected for ${username} at ${station}. Disconnecting older session (${existingSocketId}).`);
                io.to(existingSocketId).emit('force-disconnect', {
                    reason: 'Un altro dispositivo ha effettuato l\'accesso con queste credenziali.'
                });
                const oldSocket = io.sockets.sockets.get(existingSocketId);
                if (oldSocket) oldSocket.disconnect(true);
                users.delete(existingSocketId);
            }
        }

        users.set(socket.id, { id: socket.id, username, station, roomId: null });
        broadcastRooms(); // Send current rooms to the newly joined user
    });

    // Create a new room
    socket.on('create-room', () => {
        const user = users.get(socket.id);
        if (!user) return;

        // Generate a simple 4-digit code
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms.set(roomId, {
            id: roomId,
            name: `Stanza di ${user.username}`,
            creatorName: user.username,
            creatorStation: user.station,
            peers: [socket.id]
        });

        user.roomId = roomId;
        socket.join(roomId);

        socket.emit('room-created', { roomId });
        broadcastRooms();
        console.log(`${user.username} created room ${roomId}`);
    });

    // Join an existing room
    socket.on('join-room', ({ roomId }) => {
        const user = users.get(socket.id);
        const room = rooms.get(roomId);

        if (!user || !room) {
            socket.emit('room-error', { message: 'Stanza non trovata.' });
            return;
        }
        if (room.peers.length >= 2) {
            socket.emit('room-error', { message: 'Stanza al completo.' });
            return;
        }

        room.peers.push(socket.id);
        user.roomId = roomId;
        socket.join(roomId);

        socket.emit('room-joined', { roomId, peers: room.peers });

        // Let the other peer(s) know someone joined, so they can start WebRTC
        socket.to(roomId).emit('user-joined-room', {
            socketId: socket.id,
            username: user.username,
            station: user.station
        });

        broadcastRooms();
        console.log(`${user.username} joined room ${roomId}`);
    });

    // Leave a room
    socket.on('leave-room', () => {
        const user = users.get(socket.id);
        if (!user || !user.roomId) return;

        const roomId = user.roomId;
        const room = rooms.get(roomId);
        if (room) {
            room.peers = room.peers.filter(id => id !== socket.id);
            socket.to(roomId).emit('user-left-room', { socketId: socket.id });
            socket.leave(roomId);

            // If empty, delete the room
            if (room.peers.length === 0) {
                rooms.delete(roomId);
            }
        }
        user.roomId = null;
        broadcastRooms();
    });

    // WebRTC Signaling routing (now targeted by socketId still, but scoped conceptually to rooms)
    socket.on('offer', (data) => {
        io.to(data.target).emit('offer', data);
    });

    socket.on('answer', (data) => {
        io.to(data.target).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', data);
    });

    socket.on('call-ended', (data) => {
        io.to(data.target).emit('call-ended', data);
    });

    // --- V2.1.0 Discord-style Feature Synchronization ---

    // Broadcast Microphone/Camera mute states to the entire room
    socket.on('media-state-change', (data) => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            // data: { micMuted: boolean, camMuted: boolean, profilePic: string }
            socket.to(user.roomId).emit('media-state-change', {
                socketId: socket.id,
                ...data
            });
        }
    });

    // Broadcast Hand Raise toggles
    socket.on('hand-raise', (data) => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            // data: { isRaised: boolean }
            socket.to(user.roomId).emit('hand-raise', {
                socketId: socket.id,
                isRaised: data.isRaised
            });
        }
    });

    // Broadcast Chat Messages
    socket.on('chat-message', (data) => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            // data: { id, text, fileUrl, fileType, color, timestamp }
            io.to(user.roomId).emit('chat-message', {
                socketId: socket.id,
                sender: user.username,
                ...data
            });
        }
    });

    // ---------------------------------------------------

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const user = users.get(socket.id);
        if (user) {
            if (user.roomId) {
                const room = rooms.get(user.roomId);
                if (room) {
                    room.peers = room.peers.filter(id => id !== socket.id);
                    socket.to(user.roomId).emit('user-left-room', { socketId: socket.id });
                    if (room.peers.length === 0) {
                        rooms.delete(user.roomId);
                    }
                }
            }
            users.delete(socket.id);
            broadcastRooms();
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
