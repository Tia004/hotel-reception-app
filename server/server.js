const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
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
        users.delete(socket.id);
        // Broadcast updated user list
        io.emit('users-update', Array.from(users.values()));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
