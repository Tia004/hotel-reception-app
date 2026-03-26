import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
    Animated, Dimensions, Platform, Image, Modal, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import { RTCView } from '../utils/webrtc';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant } from 'livekit-client';

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏', '🙌', '👍'];

function FloatingEmoji({ emoji, onComplete }) {
    const yAnim = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(yAnim, {
                toValue: -300 - Math.random() * 100,
                duration: 2500,
                useNativeDriver: true
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 2500,
                useNativeDriver: true
            })
        ]).start(onComplete);
    }, []);

    const xPos = useRef(Math.random() * (Dimensions.get('window').width - 100) + 50).current;

    return (
        <Animated.Text 
            style={[
                styles.floatingEmoji, 
                { 
                    left: xPos,
                    transform: [{ translateY: yAnim }], 
                    opacity 
                }
            ]}
        >
            {emoji}
        </Animated.Text>
    );
}

export default function CallScreen({ socket, roomId, user, onMinimize }) {
    // ── UI States ────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [deafenOn, setDeafenOn] = useState(false);
    const [handRaised, setHandRaised] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const [activeTab, setActiveTab] = useState('video'); // 'video' | 'participants'
    const [chatVisible, setChatVisible] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatDraft, setChatDraft] = useState('');
    const [showReactions, setShowReactions] = useState(false);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [connectionErrors, setConnectionErrors] = useState({});
    const [showDebug, setShowDebug] = useState(false);

    const [lkRoom, setLkRoom] = useState(null);
    const [participants, setParticipants] = useState([]); // Array of Participant objects
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // identity -> MediaStream
    const [connecting, setConnecting] = useState(false);
    const [debugLogs, setDebugLogs] = useState([]);

    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString();
        setDebugLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
        console.log(`[LK-DEBUG] ${msg}`);
    };

    const chatScrollRef = useRef(null);
    const spinAnim = useRef(new Animated.Value(0)).current;

    // ── Initialization ───────────────────────────────────────────────────
    useEffect(() => {
        Animated.loop(
            Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
        ).start();
        const timer = setTimeout(() => setLoading(false), 400);
        return () => clearTimeout(timer);
    }, []);

    const lkUrl = "wss://gsa-hotels-calls-ls2c6m36.livekit.cloud";
    const API_BASE = "https://hotel-reception-app.onrender.com";

    const fetchTokenAndConnect = useCallback(async () => {
        try {
            setConnecting(true);
            addLog(`Inizio connessione a ${roomId}...`);

            // 1. Get Token from Internal Server
            addLog(`Richiesta token a ${API_BASE}...`);
            const response = await fetch(`${API_BASE}/get-livekit-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room: roomId, username: user.username })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`Server Token Error: ${response.status} ${errData.error || ''}`);
            }

            const { token } = await response.json();
            if (!token) throw new Error("Token non ricevuto dal server");
            addLog("Token ricevuto correttamente.");

            // 2. Initialize LiveKit Room
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            // 3. Event Listeners
            const updateParticipants = () => {
                setParticipants([room.localParticipant, ...Array.from(room.participants.values())]);
            };

            room.on(RoomEvent.ParticipantConnected, (p) => {
                addLog(`Partecipante connesso: ${p.identity}`);
                updateParticipants();
            });
            room.on(RoomEvent.ParticipantDisconnected, (p) => {
                addLog(`Partecipante disconnesso: ${p.identity}`);
                updateParticipants();
            });
            room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                addLog(`Traccia sottoscritta: ${track.kind} da ${participant.identity}`);
                if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
                    setRemoteStreams(prev => ({
                        ...prev,
                        [participant.identity]: track.mediaStream
                    }));
                }
            });
            
            room.on(RoomEvent.ConnectionStateChanged, (state) => {
                addLog(`Stato connessione: ${state}`);
            });

            room.on(RoomEvent.DataReceived, (payload, participant) => {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'reaction') {
                    onEmojiReaction({ emoji: data.emoji });
                }
            });

            // 4. Connect
            addLog(`Connessione a LiveKit SFU (${lkUrl})...`);
            await room.connect(lkUrl, token);
            addLog(`Connesso alla stanza: ${room.name}`);

            // 5. Start Local Media
            addLog("Tentativo di attivazione Camera e Microfono...");
            try {
                await room.localParticipant.enableCameraAndMicrophone();
                addLog("Camera e Microfono attivati.");
                
                // Get the video track media stream
                const videoPub = room.localParticipant.getTrack(Track.Source.Camera);
                if (videoPub && videoPub.videoTrack) {
                    addLog("Traccia video locale trovata.");
                    setLocalStream(videoPub.videoTrack.mediaStream);
                } else {
                    addLog("⚠️ ATTENZIONE: Traccia video locale non trovata dopo enable.");
                }
            } catch (mediaErr) {
                addLog(`❌ Errore Media: ${mediaErr.message}`);
                console.error("Media Error:", mediaErr);
            }
            
            setLkRoom(room);
            updateParticipants();
            setConnecting(false);
        } catch (err) {
            addLog(`❌ ERRORE CRITICO: ${err.message}`);
            console.error('[LiveKit] Connection Failed:', err);
            setConnecting(false);
            setConnectionErrors({ main: err.message });
        }
    }, [roomId, user.username, lkUrl, API_BASE]);

    useEffect(() => {
        if (!socket || !roomId) return;
        fetchTokenAndConnect();

        const onChatMsg = (msg) => {
            setChatMessages(prev => [...prev, msg]);
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
        };
        const onEmoji = ({ emoji }) => onEmojiReaction({ emoji });

        socket.on('chat-message', onChatMsg);
        socket.on('emoji-reaction', onEmoji);
        socket.emit('room-chat-history', { roomId });
        socket.on('room-chat-history', ({ messages: hist }) => {
            if (hist) setChatMessages(hist);
        });

        return () => {
            if (lkRoom) {
                lkRoom.disconnect();
                setLkRoom(null);
            }
            socket.off('chat-message', onChatMsg);
            socket.off('emoji-reaction', onEmoji);
            socket.off('room-chat-history');
        };
    }, [roomId, socket, fetchTokenAndConnect]);

    // ── Actions ──────────────────────────────────────────────────────────
    const toggleMic = () => {
        const next = !micOn;
        setMicOn(next);
        lkRoom?.localParticipant.setMicrophoneEnabled(next);
    };

    const toggleCam = () => {
        const next = !camOn;
        setCamOn(next);
        lkRoom?.localParticipant.setCameraEnabled(next);
    };

    const toggleDeafen = () => {
        setDeafenOn(!deafenOn);
        // Logic to mute all remote audio
    };

    const sendReaction = (emoji) => {
        setShowReactions(false);
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
        
        if (lkRoom) {
            const data = JSON.stringify({ type: 'reaction', emoji });
            lkRoom.localParticipant.publishData(new TextEncoder().encode(data));
        }
    };

    const onEmojiReaction = ({ emoji }) => {
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
    };

    const sendChatMessage = () => {
        if (!chatDraft.trim()) return;
        const msg = { sender: user.username, text: chatDraft, time: new Date() };
        socket.emit('chat-message', { roomId, ...msg });
        setChatDraft('');
    };

    // ── Helper ───────────────────────────────────────────────────────────
    const getParticipantStream = (p) => {
        if (p instanceof LocalParticipant) return localStream;
        return remoteStreams[p.identity];
    };

    // ── Render Parts ─────────────────────────────────────────────────────
    const renderTile = (participant) => {
        const isLocal = participant instanceof LocalParticipant;
        const stream = getParticipantStream(participant);
        const videoTrack = participant.getTrack(Track.Source.Camera);
        const hasVideo = videoTrack?.isSubscribed || isLocal ? videoTrack?.isEnabled : false;

        return (
            <View key={participant.identity} style={[styles.tile, participants.length <= 2 ? styles.tileLarge : styles.tileMedium]}>
                {hasVideo && stream ? (
                    <RTCView 
                        streamURL={stream.toURL?.() || (Platform.OS === 'web' ? stream : '')} 
                        style={styles.rtc} 
                        objectFit="cover"
                    />
                ) : (
                    <View style={styles.avatarTile}>
                        <View style={styles.avatarCircle}>
                            <Text style={styles.avatarTxt}>{participant.identity.charAt(0).toUpperCase()}</Text>
                        </View>
                    </View>
                )}
                <View style={styles.participantOverlay}>
                    <View style={styles.participantNameRow}>
                        <Text style={styles.participantName}>{isLocal ? "Tu" : participant.identity}</Text>
                        {!participant.isMicrophoneEnabled && (
                            <View style={styles.statusIconRed}>
                                <Icon name="mic-off" size={10} color="#fff" />
                            </View>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#C9A84C" />
                <Text style={{ color: '#554E40', marginTop: 10 }}>Inizializzazione LiveKit...</Text>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <LinearGradient colors={['#1A1917', '#12110F']} style={StyleSheet.absoluteFill} />

            {/* Reactions Layer */}
            <View style={styles.floatingEmojiContainer} pointerEvents="none">
                {floatingReactions.map(r => (
                    <FloatingEmoji 
                        key={r.id} 
                        emoji={r.emoji} 
                        onComplete={() => setFloatingReactions(prev => prev.filter(x => x.id !== r.id))} 
                    />
                ))}
            </View>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onMinimize} style={styles.minimizeBtn}>
                    <Icon name="chevron-down" size={18} color="#C9A84C" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={styles.roomBadge}>
                        <Text style={styles.roomName}>{roomId.toUpperCase()}</Text>
                        {connecting && <ActivityIndicator size="small" color="#C9A84C" />}
                    </View>
                </View>
                <TouchableOpacity onPress={() => setShowDebug(!showDebug)} style={{ marginRight: 10 }}>
                    <Icon name="terminal" size={18} color={showDebug ? "#C9A84C" : "#E8E4D8"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setChatVisible(!chatVisible)} style={styles.reactionBtn}>
                    <Icon name="message-square" size={18} color={chatVisible ? "#C9A84C" : "#E8E4D8"} />
                </TouchableOpacity>
            </View>

            {/* Video Grid */}
            <ScrollView contentContainerStyle={styles.videoGrid}>
                {participants.map(renderTile)}
            </ScrollView>

            {/* Chat Panel */}
            {chatVisible && (
                <View style={styles.chatPanel}>
                    <ScrollView ref={chatScrollRef} style={styles.chatScroll}>
                        {(chatMessages || []).map((msg, i) => (
                            <View key={i} style={[styles.chatMsg, msg?.sender === user.username && styles.chatMsgMine]}>
                                <Text style={styles.chatMsgSender}>{msg?.sender || '?'}</Text>
                                <Text style={styles.chatMsgText}>{msg?.text || ''}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    <View style={styles.chatInputRow}>
                        <TextInput
                            style={styles.chatInput}
                            placeholder="Messaggio..."
                            value={chatDraft}
                            onChangeText={setChatDraft}
                        />
                        <TouchableOpacity onPress={sendChatMessage} style={styles.chatSendBtn}>
                            <Icon name="send" size={16} color="#111" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Debug Panel */}
            {showDebug && (
                <View style={styles.debugPanel}>
                    <Text style={styles.debugTitle}>LIVEKIT DEBUG CONSOLE</Text>
                    <ScrollView style={styles.debugScroll}>
                        {(debugLogs || []).map((log, i) => (
                            <Text key={i} style={styles.debugText}>{log}</Text>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity onPress={toggleMic} style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]}>
                    <Icon name={micOn ? "mic" : "mic-off"} size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleCam} style={[styles.ctrlBtn, !camOn && styles.ctrlBtnOff]}>
                    <Icon name={camOn ? "video" : "video-off"} size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowReactions(!showReactions)} style={styles.ctrlBtn}>
                    <Icon name="smile" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onMinimize()} style={styles.hangupBtn}>
                    <Icon name="phone-off" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Emoji Popup */}
            {showReactions && (
                <View style={styles.reactionsPopup}>
                    <View style={styles.reactionsRow}>
                        {EMOJI_REACTIONS.map(e => (
                            <TouchableOpacity key={e} onPress={() => sendReaction(e)}>
                                <Text style={{ fontSize: 24 }}>{e}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#1A1917' },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    minimizeBtn: { padding: 8 },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    roomName: { color: '#C9A84C', fontWeight: '800', fontSize: 13 },
    videoGrid: { padding: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    tile: { backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    tileLarge: { width: '100%', aspectRatio: 16 / 9 },
    tileMedium: { width: '48%', aspectRatio: 16 / 9 },
    rtc: { flex: 1 },
    avatarTile: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#12110F' },
    avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#C9A84C' },
    avatarTxt: { color: '#C9A84C', fontSize: 32, fontWeight: '800' },
    participantOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10 },
    participantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    participantName: { color: '#fff', fontSize: 12, fontWeight: '800' },
    statusIconRed: { backgroundColor: '#ED4245', borderRadius: 10, padding: 2 },
    controls: { height: 100, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    ctrlBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2B2D31', justifyContent: 'center', alignItems: 'center' },
    ctrlBtnOff: { backgroundColor: '#ED4245' },
    hangupBtn: { width: 70, height: 50, borderRadius: 25, backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center' },
    chatPanel: { height: 300, backgroundColor: '#12110F', borderTopWidth: 1, borderTopColor: '#C9A84C' },
    chatScroll: { flex: 1, padding: 15 },
    chatMsg: { marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 10, maxWidth: '80%' },
    chatMsgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(201,168,76,0.2)' },
    chatMsgSender: { color: '#C9A84C', fontSize: 10, fontWeight: '800', marginBottom: 2 },
    chatMsgText: { color: '#fff', fontSize: 14 },
    chatInputRow: { height: 60, flexDirection: 'row', padding: 10, gap: 10 },
    chatInput: { flex: 1, backgroundColor: '#1C1A16', borderRadius: 10, paddingHorizontal: 15, color: '#fff' },
    chatSendBtn: { width: 40, height: 40, backgroundColor: '#C9A84C', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    reactionsPopup: { position: 'absolute', bottom: 150, alignSelf: 'center', backgroundColor: '#2B2D31', padding: 15, borderRadius: 30 },
    reactionsRow: { flexDirection: 'row', gap: 15 },
    floatingEmojiContainer: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
    floatingEmoji: { fontSize: 40, alignSelf: 'center' },
    debugPanel: { position: 'absolute', top: 70, left: 10, right: 10, bottom: 120, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 10, padding: 10, zIndex: 2000, borderWidth: 1, borderColor: '#C9A84C' },
    debugTitle: { color: '#C9A84C', fontWeight: 'bold', fontSize: 12, marginBottom: 5, textAlign: 'center' },
    debugScroll: { flex: 1 },
    debugText: { color: '#00FF00', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 2 }
});
