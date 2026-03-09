const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Necessario per load-balancer HTTPS come Render
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store connected users. Map of socket.id -> { id, username, station }
const users = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // When a user logs in and joins the signaling server
    socket.on('join', (data) => {
        const { username, station } = data;

        // --- ENFORCE UNIQUE SESSIONS ---
        // Check if a user with the same username AND station is already connected
        for (const [existingSocketId, user] of users.entries()) {
            if (user.username === username && user.station === station) {
                // Duplicate found! We need to disconnect the older session.
                console.log(`Duplicate session detected for ${username} at ${station}. Disconnecting older session (${existingSocketId}).`);

                // Notify the old client so indicating why they are being disconnected
                io.to(existingSocketId).emit('force-disconnect', {
                    reason: 'Un altro dispositivo ha effettuato l\'accesso con queste credenziali.'
                });

                // Get the socket instance and forcefully disconnect it
                const oldSocket = io.sockets.sockets.get(existingSocketId);
                if (oldSocket) {
                    oldSocket.disconnect(true); // true means close the underlying connection
                }

                // Remove them from the active users map
                users.delete(existingSocketId);
            }
        }
        // ---------------------------------

        // Add the new valid session
        users.set(socket.id, { id: socket.id, username, station });

        // Broadcast updated user list to everyone
        io.emit('users-update', Array.from(users.values()));
        console.log(`${username} joined at station: ${station}`);
    });

    // WebRTC Signaling: Offer
    socket.on('offer', (data) => {
        // data: { target: socketId, caller: socketId, sdp: offerSdp }
        io.to(data.target).emit('offer', data);
    });

    // WebRTC Signaling: Answer
    socket.on('answer', (data) => {
        // data: { target: socketId, caller: socketId, sdp: answerSdp }
        io.to(data.target).emit('answer', data);
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('ice-candidate', (data) => {
        // data: { target: socketId, candidate: iceCandidate }
        io.to(data.target).emit('ice-candidate', data);
    });

    // Custom Events (e.g., call rejected, ended)
    socket.on('call-rejected', (data) => {
        io.to(data.target).emit('call-rejected', data);
    });

    socket.on('call-ended', (data) => {
        io.to(data.target).emit('call-ended', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Only delete if they are actually in the map (might have been removed by force-disconnect)
        if (users.has(socket.id)) {
            users.delete(socket.id);
            // Broadcast updated user list
            io.emit('users-update', Array.from(users.values()));
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
