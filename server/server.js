const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { AccessToken } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { version: APP_VERSION } = require('./version.json');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ── LiveKit Token Endpoint ───────────────────────────────────────────────
app.post('/get-livekit-token', async (req, res) => {
    try {
        const { room, username } = req.body;
        if (!room || !username) return res.status(400).json({ error: 'Missing room or username' });

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;

        if (!apiKey || !apiSecret) {
            console.error('LiveKit Server Error: API keys not found in .env');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const at = new AccessToken(apiKey, apiSecret, { identity: username });
        at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

        const token = await at.toJwt();
        res.json({ token });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// ── Authentication Endpoint ──────────────────────────────────────────────
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', username.toLowerCase().trim())
            .eq('password', password)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Credenziali non valide' });
        }

        res.json({ 
            username: data.username, 
            station: data.role,
            bio: data.bio,
            profilePic: data.profile_pic
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/ping', (req, res) => res.status(200).send('pong'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Supabase Initialization ──────────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ── Auto-Cleanup Logic (Delete messages older than 48 hours) ──────────
const cleanupOldMessages = async () => {
    try {
        const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { error, count } = await supabase
            .from('messages')
            .delete()
            .lt('created_at', threshold);
        
        if (error) throw error;
        console.log(`[Supabase] Cleanup done. Deleted ${count || 0} messages older than 48h.`);
    } catch (err) {
        console.error('[Supabase] Cleanup error:', err.message);
    }
};

// Run cleanup every 6 hours
setInterval(cleanupOldMessages, 6 * 60 * 60 * 1000);
// Initial run
cleanupOldMessages();

// ─── Persistence Helpers ────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const LIMIT_HISTORY = 200;
const ARCHIVES_FILE = path.join(DATA_DIR, 'voice_archives.json');

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

function saveVoiceArchives() {
    const obj = {};
    for (const [k, v] of voiceArchives.entries()) obj[k] = v;
    saveJSON(ARCHIVES_FILE, obj);
}

// ─── Data Stores ───────────────────────────────────────────────────────────────
const users = new Map();          // socketId → { id, username, station, roomId, status }
const allKnownUsers = new Map();  // Cache of profiles from Supabase

// Fetch all profiles from Supabase to initialize the cache
const syncProfiles = async () => {
    try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        
        allKnownUsers.clear();
        data.forEach(p => {
            allKnownUsers.set(p.username, {
                username: p.username,
                station: p.role,
                status: 'invisible',
                bio: p.bio || '',
                profilePic: p.profile_pic || null
            });
        });
        console.log(`[Supabase] Synced ${data.length} user profiles.`);
    } catch (err) {
        console.error('[Supabase] Profile sync error:', err.message);
    }
};

syncProfiles();

const rooms = new Map();          // roomId → { id, name, creatorName, peers, isTemp, chatMessages, deleteTimer }

// Hotel channel messages — load from disk
const HOTEL_CHANNELS = [
    'duchessa-generale', 'duchessa-media', 'duchessa-annunci',
    'blumen-generale', 'blumen-media', 'blumen-annunci',
    'santorsola-generale', 'santorsola-media', 'santorsola-annunci',
];

const voiceArchives = new Map();
const objArch = loadJSON(ARCHIVES_FILE, {});
for (const k in objArch) voiceArchives.set(k, objArch[k]);

// Auto-save voice archives every 30 seconds
setInterval(() => {
    saveVoiceArchives();
}, 30 * 1000);

// Also re-sync profiles periodically
setInterval(syncProfiles, 5 * 60 * 1000);

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
            // SAVE ARCHIVE BEFORE DELETE
            if (r.chatMessages && r.chatMessages.length > 0) {
                voiceArchives.set(roomId, {
                    roomId,
                    name: r.name,
                    closedAt: Date.now(),
                    messages: r.chatMessages
                });
                saveVoiceArchives();
            }
            rooms.delete(roomId);
            broadcastRooms();
            console.log(`[Room] Auto-deleted empty room ${roomId} and archived its chat`);
        }
    }, 2 * 60 * 1000); // 2 minutes
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);
    
    // Send current app version to client to check for stale builds
    socket.emit('app-version', { version: APP_VERSION });

    // ── Auth ────────────────────────────────────────────────────────────────
    socket.on('get-voice-archives', () => {
        const list = Array.from(voiceArchives.values()).sort((a,b) => b.closedAt - a.closedAt);
        socket.emit('voice-archives', list);
    });

    socket.on('room-chat-message', ({ roomId, text, imageData }) => {
        const user = users.get(socket.id);
        const room = rooms.get(roomId);
        if (!user || !room) return;
        const msg = {
            id: Date.now(),
            sender: user.username,
            text: text || '',
            imageData: imageData || null,
            timestamp: Date.now()
        };
        if (!room.chatMessages) room.chatMessages = [];
        room.chatMessages.push(msg);
        io.to(roomId).emit('room-chat-message', msg);
    });

    socket.on('room-chat-history', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            socket.emit('room-chat-history', { roomId, messages: room.chatMessages || [] });
        }
    });

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

        // Persist profile pic if it changed
        if (data.profilePic) {
            supabase.from('profiles')
                .update({ profile_pic: data.profilePic })
                .eq('username', username)
                .then(({ error }) => { if (error) console.error('[Supabase] Pic update error:', error); });
        }

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
    socket.on('peer-heartbeat', ({ roomId }) => {
        if (roomId) socket.to(roomId).emit('peer-heartbeat', { sender: socket.id });
    });

    socket.on('get-room-peers', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            socket.emit('room-peers', { peers: room.peers });
        }
    });

    // Debug 1v1
    socket.on('debug-offer', (d) => io.to(d.target).emit('debug-offer', { ...d, sender: socket.id }));
    socket.on('debug-answer', (d) => io.to(d.target).emit('debug-answer', { ...d, sender: socket.id }));
    socket.on('debug-ice', (d) => io.to(d.target).emit('debug-ice', { ...d, sender: socket.id }));

    // ── In-Call Media State ──────────────────────────────────────────────────
    socket.on('media-state-change', (data) => {
        const user = users.get(socket.id);
        if (user?.roomId) socket.to(user.roomId).emit('media-state-change', { socketId: socket.id, ...data });
    });

    socket.on('hand-raise', (data) => {
        const user = users.get(socket.id);
        if (user?.roomId) socket.to(user.roomId).emit('hand-raise', { socketId: socket.id, isRaised: data.isRaised });
    });

    // ── In-Call Chat (LiveKit Room Chat) ───────────────────────────────────
    socket.on('chat-message', async (data) => {
        const user = users.get(socket.id);
        if (!user?.roomId) return;
        
        const msgObj = { 
            room_id: user.roomId, 
            sender: user.username, 
            text: data.text, 
            image_data: data.imageData || null,
            created_at: new Date().toISOString()
        };

        // Emit to room (real-time)
        socket.to(user.roomId).emit('chat-message', { ...data, sender: user.username, timestamp: Date.now() });

        // Persist to Supabase
        try {
            const { error } = await supabase.from('messages').insert([msgObj]);
            if (error) console.error('[Supabase] Save error:', error.message);
        } catch (e) {
            console.error('[Supabase] Network error:', e.message);
        }
    });

    socket.on('room-chat-history', async ({ roomId }) => {
        if (!roomId) return;
        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) throw error;
            
            // Format for frontend (identity mapping)
            const history = (messages || []).map(m => ({
                sender: m.sender,
                text: m.text,
                imageData: m.image_data,
                timestamp: new Date(m.created_at).getTime()
            }));
            
            socket.emit('room-chat-history', { messages: history });
        } catch (e) {
            console.error('[Supabase] History fetch error:', e.message);
            socket.emit('room-chat-history', { messages: [] });
        }
    });

    // List all rooms that have messages in Supabase
    socket.on('get-room-archives', async () => {
        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select('room_id, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Deduplicate room IDs and keep the most recent created_at
            const archiveMap = new Map();
            (messages || []).forEach(m => {
                if (!archiveMap.has(m.room_id)) {
                    archiveMap.set(m.room_id, new Date(m.created_at).getTime());
                }
            });

            const archives = Array.from(archiveMap.entries()).map(([roomId, mtime]) => ({
                roomId,
                mtime
            }));

            socket.emit('room-archives', { archives });
        } catch (e) {
            console.error('[Supabase] Archive list failed:', e.message);
            socket.emit('room-archives', { archives: [] });
        }
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

    socket.on('channel-message', async (data) => {
        const { channelId, text, imageData, gifUrl, poll, voiceData, voiceDuration, replyTo } = data;
        const user = users.get(socket.id);
        if (!user || !HOTEL_CHANNELS.includes(channelId)) return;

        const msgObj = {
            room_id: `channel:${channelId}`,
            sender: user.username,
            station: user.station,
            text: text || '',
            image_data: imageData || null,
            gif_url: gifUrl || null,
            poll_data: poll ? { ...poll, votes: poll.votes || {}, isMultiple: poll.isMultiple || false } : null,
            voice_data: voiceData || null,
            voice_duration: voiceDuration || 0,
            reply_to: replyTo || null,
            edited: false,
            pinned: false,
            reactions: {},
            created_at: new Date().toISOString()
        };

        const finalMsg = { ...data, sender: user.username, timestamp: Date.now() };

        // Emit to channel (real-time)
        io.to(`channel:${channelId}`).emit('channel-message', { 
            channelId, 
            message: finalMsg 
        });

        // Save to Supabase
        try {
            const { error } = await supabase.from('messages').insert([msgObj]);
            if (error) console.error('[Supabase] Channel save error:', error.message);
        } catch (e) { console.error('[Supabase] Channel network error:', e.message); }
    });

    socket.on('get-channel-history', async ({ channelId }) => {
        if (!channelId) return;
        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room_id', `channel:${channelId}`)
                .order('created_at', { ascending: true })
                .limit(LIMIT_HISTORY);

            if (error) throw error;
            const history = (messages || []).map(m => ({
                id: m.id, // Supabase ID
                sender: m.sender,
                station: m.station,
                text: m.text,
                imageData: m.image_data,
                gifUrl: m.gif_url,
                poll: m.poll_data,
                voiceData: m.voice_data,
                voiceDuration: m.voice_duration,
                replyTo: m.reply_to,
                edited: m.edited,
                timestamp: new Date(m.created_at).getTime(),
                pinned: m.pinned,
                reactions: m.reactions,
                status: 'sent', // Default status for historical messages
                deliveredTo: [], // Not tracked in Supabase for channel messages
                readBy: [], // Not tracked in Supabase for channel messages
            }));

            // Fetch pinned messages separately
            const { data: pinnedMessagesData, error: pinnedError } = await supabase
                .from('messages')
                .select('*')
                .eq('room_id', `channel:${channelId}`)
                .eq('pinned', true)
                .order('created_at', { ascending: true });

            if (pinnedError) throw pinnedError;

            const pinned = (pinnedMessagesData || []).map(m => ({
                id: m.id,
                sender: m.sender,
                station: m.station,
                text: m.text,
                imageData: m.image_data,
                gifUrl: m.gif_url,
                poll: m.poll_data,
                voiceData: m.voice_data,
                voiceDuration: m.voice_duration,
                replyTo: m.reply_to,
                edited: m.edited,
                timestamp: new Date(m.created_at).getTime(),
                pinned: m.pinned,
                reactions: m.reactions,
            }));

            socket.emit('channel-history', { channelId, messages: history, pinned });
        } catch (e) {
            console.error('[Supabase] Channel history error:', e.message);
            socket.emit('channel-history', { channelId, messages: [], pinned: [] });
        }
    });

    // Mark messages as read (Simplified: not persisting for now)
    socket.on('mark-read', ({ channelId, messageIds }) => {
        const user = users.get(socket.id);
        if (!user) return;
        io.to(`channel:${channelId}`).emit('read-receipt-update', { channelId, reader: user.username, receipts: messageIds.map(id => ({ messageId: id, receipt: { user: user.username, time: new Date().toLocaleTimeString() } })) });
    });

    socket.on('edit-message', async ({ channelId, messageId, text }) => {
        try {
            const { error } = await supabase.from('messages').update({ text, edited: true }).eq('id', messageId);
            if (error) throw error;
            io.to(`channel:${channelId}`).emit('message-edited', { channelId, messageId, text });
        } catch (e) { console.error('[Supabase] Edit error:', e.message); }
    });

    socket.on('delete-message', async ({ channelId, messageId }) => {
        try {
            const { error } = await supabase.from('messages').delete().eq('id', messageId);
            if (error) throw error;
            io.to(`channel:${channelId}`).emit('message-deleted', { channelId, messageId });
        } catch (e) { console.error('[Supabase] Delete error:', e.message); }
    });

    socket.on('react-message', async ({ channelId, messageId, emoji }) => {
        const user = users.get(socket.id);
        if (!user) return;
        try {
            // Get current reactions
            const { data, error: fetchErr } = await supabase.from('messages').select('reactions').eq('id', messageId).single();
            if (fetchErr) throw fetchErr;

            let reactions = data.reactions || {};
            
            // Toggle reaction
            if (!reactions[emoji]) reactions[emoji] = [];
            const idx = reactions[emoji].indexOf(user.username);
            if (idx > -1) reactions[emoji].splice(idx, 1);
            else reactions[emoji].push(user.username);
            
            if (reactions[emoji].length === 0) delete reactions[emoji];

            const { error: updateErr } = await supabase.from('messages').update({ reactions }).eq('id', messageId);
            if (updateErr) throw updateErr;

            io.to(`channel:${channelId}`).emit('message-reacted', { channelId, messageId, reactions });
        } catch (e) { console.error('[Supabase] React error:', e.message); }
    });

    socket.on('channel-poll-vote', async ({ channelId, messageId, optionIndex }) => {
        const user = users.get(socket.id);
        if (!user) return;
        try {
            const { data, error: fetchErr } = await supabase.from('messages').select('poll_data').eq('id', messageId).single();
            if (fetchErr) throw fetchErr;
            if (!data.poll_data) return;

            let poll = data.poll_data;
            let votes = poll.votes || {};
            const userId = user.username;

            if (!poll.isMultiple) {
                Object.keys(votes).forEach(k => {
                    if (parseInt(k) !== optionIndex) votes[k] = (votes[k] || []).filter(u => u !== userId);
                });
            }
            if (!votes[optionIndex]) votes[optionIndex] = [];
            if (votes[optionIndex].includes(userId)) votes[optionIndex] = votes[optionIndex].filter(u => u !== userId);
            else votes[optionIndex].push(userId);

            poll.votes = votes;
            const { error: updateErr } = await supabase.from('messages').update({ poll_data: poll }).eq('id', messageId);
            if (updateErr) throw updateErr;

            io.to(`channel:${channelId}`).emit('channel-poll-update', { channelId, messageId, votes });
        } catch (e) { console.error('[Supabase] Poll vote error:', e.message); }
    });

    // User presence / status broadcast
    socket.on('user-status', ({ status }) => {
        const user = users.get(socket.id);
        if (user) { 
            user.status = status; 
            if(allKnownUsers.has(user.username)) allKnownUsers.get(user.username).status = status;
            broadcastUsers(); 
        }
    });
    socket.on('user-bio', ({ bio }) => {
        const user = users.get(socket.id);
        if (user) { 
            user.bio = bio; 
            if(allKnownUsers.has(user.username)) allKnownUsers.get(user.username).bio = bio;
            
            // Persist to Supabase
            supabase.from('profiles')
                .update({ bio: bio })
                .eq('username', user.username)
                .then(({ error }) => { if (error) console.error('[Supabase] Bio update error:', error); });

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
            }
            broadcastRooms();
            broadcastUsers();
        }
        console.log(`Disconnected: ${socket.id}`);
    });
});

// ─── Static Files & SPA Routing ───────────────────────────────────────────
const DIST_PATH = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(DIST_PATH)) {
    console.log(`Serving static files from: ${DIST_PATH}`);
    app.use(express.static(DIST_PATH));
    app.get('*', (req, res) => {
        res.sendFile(path.join(DIST_PATH, 'index.html'));
    });
} else {
    console.warn(`Static dist folder not found at: ${DIST_PATH}. Frontend will not be served.`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
