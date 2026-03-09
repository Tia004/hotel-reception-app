/**
 * CallScreen.js — v2.3.0
 * Receives `socket` prop from App.js (shared with HotelChat).
 * Fixes: WebRTC TURN servers, video centering (always 16:9), room types,
 *        screen share button, emoji reactions, mobile responsive, device dropdowns.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Platform, Dimensions, TextInput, ScrollView, Animated, Modal
} from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import { LinearGradient } from 'expo-linear-gradient';
import MediaSettings from './MediaSettings';
import { Icon } from './Icons';
import { EMOJI_CATEGORIES, ALL_EMOJI } from '../utils/emoji_data';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Free TURN servers (Open Relay Project)
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
    iceCandidatePoolSize: 10,
};

// Floating reaction bubble
const ReactionBubble = ({ emoji, onDone }) => {
    const fade = useRef(new Animated.Value(1)).current;
    const move = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 0, duration: 2200, useNativeDriver: true }),
            Animated.timing(move, { toValue: -70, duration: 2200, useNativeDriver: true }),
        ]).start(onDone);
    }, []);
    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: move }], position: 'absolute', bottom: 60 }}>
            <Text style={{ fontSize: 32 }}>{emoji}</Text>
        </Animated.View>
    );
};

// Participant video tile — always 16:9
const ParticipantTile = ({ stream, isLocal, username, isMuted, isCamOff, isSpeaking, isHandRaised, reactions, onPress }) => (
    <TouchableOpacity style={[styles.tile, isSpeaking && styles.tileSpeaking]} onPress={onPress} activeOpacity={0.92}>
        {stream && !isCamOff
            ? <RTCView streamURL={stream} style={styles.tileVideo} objectFit="cover" mirror={isLocal} muted={isLocal} />
            : (
                <View style={styles.tileAvatar}>
                    <View style={styles.tileAvatarCircle}>
                        <Text style={styles.tileAvatarText}>{username?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                </View>
            )
        }
        {/* Floating reactions */}
        <View style={styles.tileReactions} pointerEvents="none">
            {(reactions || []).map(r => <ReactionBubble key={r.id} emoji={r.emoji} onDone={() => { }} />)}
        </View>
        {/* Bottom bar */}
        <View style={styles.tileBar}>
            <View style={styles.tileBarLeft}>
                {isMuted && <View style={styles.tileIndicator}><Icon name="mic-off" size={11} color="#FF4B4B" /></View>}
                {isHandRaised && <View style={[styles.tileIndicator, { borderColor: '#D4AF37' }]}><Icon name="hand" size={11} color="#D4AF37" /></View>}
            </View>
            <Text style={styles.tileName}>{username}{isLocal ? ' (Tu)' : ''}</Text>
        </View>
    </TouchableOpacity>
);

// Emoji Picker Panel (inline, above button)
const EmojiPanel = ({ onSelect, onClose }) => {
    const [tab, setTab] = useState(0);
    const [search, setSearch] = useState('');
    const list = search ? ALL_EMOJI.filter(() => true) : (EMOJI_CATEGORIES[tab]?.emoji || []);
    return (
        <View style={styles.emojiPanel}>
            <View style={styles.emojiPanelSearch}>
                <TextInput style={styles.emojiSearchInput} placeholder="Cerca..." placeholderTextColor="#72767D" value={search} onChangeText={setSearch} />
            </View>
            {!search && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 32 }}>
                    {EMOJI_CATEGORIES.map((c, i) => (
                        <TouchableOpacity key={i} onPress={() => setTab(i)} style={[styles.emojiTabBtn, tab === i && styles.emojiTabActive]}>
                            <Text style={styles.emojiTabLabel}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
            <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={styles.emojiInnerGrid}>
                {list.map((e, i) => (
                    <TouchableOpacity key={i} style={styles.emojiCell} onPress={() => { onSelect(e); onClose(); }}>
                        <Text style={{ fontSize: 22 }}>{e}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

// Room type creation modal — layout is ALWAYS stable, only colors change on selection
const CreateRoomModal = ({ visible, onClose, onConfirm }) => {
    const [type, setType] = useState('normal');
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.createRoomModal}>
                    <Text style={styles.createRoomTitle}>Crea Stanza</Text>
                    {/* Normal */}
                    <TouchableOpacity style={[styles.roomTypeBtn, type === 'normal' && styles.roomTypeBtnActive]} onPress={() => setType('normal')} activeOpacity={0.85}>
                        <Icon name="users" size={20} color={type === 'normal' ? '#D4AF37' : '#72767D'} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.roomTypeLabel, type === 'normal' && { color: '#D4AF37' }]}>Stanza Normale</Text>
                            <Text style={styles.roomTypeDesc}>La chat viene salvata e accessibile dopo la chiamata.</Text>
                        </View>
                        <View style={styles.roomTypeCheck}>
                            {type === 'normal' && <Icon name="check" size={14} color="#D4AF37" />}
                        </View>
                    </TouchableOpacity>
                    {/* Temporary */}
                    <TouchableOpacity style={[styles.roomTypeBtn, type === 'temp' && styles.roomTypeBtnActiveTemp]} onPress={() => setType('temp')} activeOpacity={0.85}>
                        <Icon name="alert-triangle" size={20} color={type === 'temp' ? '#FAA61A' : '#72767D'} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.roomTypeLabel, type === 'temp' && { color: '#FAA61A' }]}>Stanza Temporanea</Text>
                            <Text style={styles.roomTypeDesc}>Tutti i messaggi e file vengono eliminati al termine della chiamata.</Text>
                        </View>
                        <View style={styles.roomTypeCheck}>
                            {type === 'temp' && <Icon name="check" size={14} color="#FAA61A" />}
                        </View>
                    </TouchableOpacity>
                    <View style={styles.createRoomActions}>
                        <TouchableOpacity style={styles.createRoomCancel} onPress={onClose}>
                            <Text style={{ color: '#72767D', fontWeight: '600' }}>Annulla</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.createRoomConfirm, { backgroundColor: type === 'temp' ? '#FAA61A' : '#D4AF37' }]}
                            onPress={() => { onConfirm(type); onClose(); }}
                        >
                            <Text style={{ color: '#000', fontWeight: '700' }}>Crea</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default function CallScreen({ user, socket, onLogout }) {
    const [availableRooms, setAvailableRooms] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [isTemp, setIsTemp] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Connessione...');

    // Media
    const [localStream, setLocalStream] = useState(null);
    const localStreamRef = useRef(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCamMuted, setIsCamMuted] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
    const vadRef = useRef(null);

    // Devices
    const [audioInputs, setAudioInputs] = useState([]);
    const [audioOutputs, setAudioOutputs] = useState([]);
    const [videoInputs, setVideoInputs] = useState([]);
    const [selAudioIn, setSelAudioIn] = useState('');
    const [selAudioOut, setSelAudioOut] = useState('');
    const [selVideo, setSelVideo] = useState('');
    const [micDropdown, setMicDropdown] = useState(false);
    const [camDropdown, setCamDropdown] = useState(false);

    // Remote user
    const [remoteData, setRemoteData] = useState({ username: '', isMuted: false, isCamOff: false, isHandRaised: false, isSpeaking: false });

    // UI
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [focusedUser, setFocusedUser] = useState(null); // 'local' | 'remote' | null
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [createRoomVisible, setCreateRoomVisible] = useState(false);

    // Chat
    const [chatVisible, setChatVisible] = useState(false);
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState(0);
    const [draft, setDraft] = useState('');
    const chatScrollRef = useRef(null);
    const chatAnim = useRef(new Animated.Value(0)).current;

    // Emoji
    const [emojiPanel, setEmojiPanel] = useState(false); // in chat
    const [reactionPanel, setReactionPanel] = useState(false); // on video
    const [localReactions, setLocalReactions] = useState([]);
    const [remoteReactions, setRemoteReactions] = useState([]);

    // WebRTC
    const pc = useRef(null);
    const pendingCandidates = useRef([]);
    const currentPeerId = useRef(null);

    // ── Socket listeners (use prop socket) ─────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        const s = socket;

        const onRoomsUpdate = (rooms) => setAvailableRooms(rooms);
        const onRoomCreated = ({ roomId, isTemp: t }) => { setCurrentRoom(roomId); setIsTemp(t); };
        const onRoomJoined = async ({ roomId, peers, isTemp: t }) => {
            setCurrentRoom(roomId);
            setIsTemp(t);
            const creatorId = peers.find(id => id !== s.id);
            if (creatorId) await startCall(creatorId);
        };
        const onRoomError = ({ message }) => alert(`Errore: ${message}`);
        const onUserJoined = ({ username }) => setRemoteData(p => ({ ...p, username }));
        const onUserLeft = () => {
            pc.current?.close(); pc.current = null;
            setRemoteStream(null); currentPeerId.current = null; setCurrentRoom(null);
            alert("L'altro utente ha abbandonato la stanza.");
        };
        const onMediaState = (d) => setRemoteData(p => ({
            ...p,
            isMuted: d.isMicMuted ?? p.isMuted,
            isCamOff: d.isCamMuted ?? p.isCamOff,
            isSpeaking: d.isSpeaking ?? p.isSpeaking,
        }));
        const onHandRaise = (d) => setRemoteData(p => ({ ...p, isHandRaised: d.isRaised }));
        const onChatMessage = (d) => {
            setMessages(prev => [...prev, d]);
            setUnread(n => chatVisible ? 0 : n + 1);
        };
        const onEmojiReaction = ({ emoji }) => {
            const id = Date.now().toString();
            setRemoteReactions(p => [...p, { id, emoji }]);
            setTimeout(() => setRemoteReactions(p => p.filter(r => r.id !== id)), 2500);
        };
        const onOffer = async (data) => {
            if (!pc.current) createPC(data.caller);
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            flushCandidates();
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            s.emit('answer', { target: data.caller, caller: s.id, sdp: answer });
            currentPeerId.current = data.caller;
        };
        const onAnswer = async (data) => {
            await pc.current?.setRemoteDescription(new RTCSessionDescription(data.sdp));
            flushCandidates();
        };
        const onIceCandidate = async (data) => {
            if (pc.current?.remoteDescription) {
                try { await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate)); }
                catch (e) { console.warn('ICE error', e); }
            } else {
                pendingCandidates.current.push(data.candidate);
            }
        };

        s.on('rooms-update', onRoomsUpdate);
        s.on('room-created', onRoomCreated);
        s.on('room-joined', onRoomJoined);
        s.on('room-error', onRoomError);
        s.on('user-joined-room', onUserJoined);
        s.on('user-left-room', onUserLeft);
        s.on('media-state-change', onMediaState);
        s.on('hand-raise', onHandRaise);
        s.on('chat-message', onChatMessage);
        s.on('emoji-reaction', onEmojiReaction);
        s.on('offer', onOffer);
        s.on('answer', onAnswer);
        s.on('ice-candidate', onIceCandidate);

        // Ping server to update connection status
        const sigUrl = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';
        fetch(`${sigUrl}/ping`).then(() => setConnectionStatus('Connesso 🟢')).catch(() => setConnectionStatus('Errore Server 🔴'));

        startLocalStream();
        loadDevices();

        return () => {
            s.off('rooms-update', onRoomsUpdate);
            s.off('room-created', onRoomCreated);
            s.off('room-joined', onRoomJoined);
            s.off('room-error', onRoomError);
            s.off('user-joined-room', onUserJoined);
            s.off('user-left-room', onUserLeft);
            s.off('media-state-change', onMediaState);
            s.off('hand-raise', onHandRaise);
            s.off('chat-message', onChatMessage);
            s.off('emoji-reaction', onEmojiReaction);
            s.off('offer', onOffer);
            s.off('answer', onAnswer);
            s.off('ice-candidate', onIceCandidate);
        };
    }, [socket]);

    // Chat animation
    useEffect(() => {
        Animated.spring(chatAnim, { toValue: chatVisible ? 1 : 0, damping: 15, stiffness: 120, useNativeDriver: false }).start();
        if (chatVisible) setUnread(0);
    }, [chatVisible]);

    const loadDevices = async () => {
        if (Platform.OS !== 'web') return;
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            setAudioInputs(all.filter(d => d.kind === 'audioinput'));
            setAudioOutputs(all.filter(d => d.kind === 'audiooutput'));
            setVideoInputs(all.filter(d => d.kind === 'videoinput'));
        } catch (_) { }
    };

    const startLocalStream = async (vid = null, aud = null) => {
        try {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            const stream = await mediaDevices.getUserMedia({
                audio: aud ? { deviceId: aud } : true,
                video: vid ? { deviceId: vid } : true,
            });
            setLocalStream(stream);
            localStreamRef.current = stream;
            if (pc.current) {
                const senders = pc.current.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track?.kind === track.kind);
                    sender ? sender.replaceTrack(track) : pc.current.addTrack(track, stream);
                });
            }
            setupVAD(stream);
        } catch (e) { console.warn('Media error:', e.message); }
    };

    const setupVAD = (stream) => {
        if (Platform.OS !== 'web' || typeof AudioContext === 'undefined') return;
        try {
            const ctx = new AudioContext();
            const analyser = ctx.createAnalyser();
            ctx.createMediaStreamSource(stream).connect(analyser);
            analyser.fftSize = 256;
            const data = new Uint8Array(analyser.frequencyBinCount);
            if (vadRef.current) clearInterval(vadRef.current);
            vadRef.current = setInterval(() => {
                analyser.getByteFrequencyData(data);
                setIsLocalSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 15);
            }, 150);
        } catch (_) { }
    };

    const flushCandidates = () => {
        if (!pc.current?.remoteDescription) return;
        pendingCandidates.current.forEach(async c => {
            try { await pc.current.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { }
        });
        pendingCandidates.current = [];
    };

    const createPC = (targetId) => {
        const conn = new RTCPeerConnection(ICE_CONFIG);
        conn.onicecandidate = (e) => {
            if (e.candidate && socket) socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
        };
        conn.ontrack = (e) => {
            if (e.streams?.[0]) {
                setRemoteStream(e.streams[0]);
            } else if (e.track) {
                // Build stream from individual track
                const existing = pc.current?._remoteStream;
                if (existing) {
                    existing.addTrack(e.track);
                    setRemoteStream(new MediaStream(existing.getTracks()));
                } else {
                    const ms = new MediaStream([e.track]);
                    conn._remoteStream = ms;
                    setRemoteStream(ms);
                }
            }
        };
        localStreamRef.current?.getTracks().forEach(t => conn.addTrack(t, localStreamRef.current));
        pc.current = conn;
    };

    const startCall = async (targetId) => {
        createPC(targetId);
        currentPeerId.current = targetId;
        const offer = await pc.current.createOffer();
        await pc.current.setLocalDescription(offer);
        socket?.emit('offer', { target: targetId, caller: socket.id, sdp: offer });
    };

    const createRoom = (type) => socket?.emit('create-room', { isTemp: type === 'temp' });
    const joinRoom = (roomId) => socket?.emit('join-room', { roomId });
    const leaveRoom = () => {
        socket?.emit('leave-room');
        pc.current?.close(); pc.current = null;
        setRemoteStream(null); currentPeerId.current = null;
        setCurrentRoom(null); setFocusedUser(null);
        if (!isTemp) saveChatHistory();
        setMessages([]);
    };

    const saveChatHistory = () => {
        if (!messages.length || Platform.OS !== 'web') return;
        try {
            const history = JSON.parse(localStorage.getItem('gsa_call_history') || '[]');
            history.unshift({ roomId: currentRoom, date: Date.now(), messages: messages.slice(-50) });
            localStorage.setItem('gsa_call_history', JSON.stringify(history.slice(0, 20)));
        } catch (_) { }
    };

    const toggleMic = () => {
        const t = localStreamRef.current?.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        const muted = !t.enabled;
        setIsMicMuted(muted);
        socket?.emit('media-state-change', { isMicMuted: muted, isCamMuted: isCamMuted });
    };
    const toggleCam = () => {
        const t = localStreamRef.current?.getVideoTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        const off = !t.enabled;
        setIsCamMuted(off);
        socket?.emit('media-state-change', { isMicMuted, isCamMuted: off });
    };
    const toggleHandRaise = () => {
        const next = !isHandRaised;
        setIsHandRaised(next);
        socket?.emit('hand-raise', { isRaised: next });
    };
    const sendMessage = () => {
        const text = draft.trim();
        if (!text || !socket) return;
        const msg = { sender: user.username, text, timestamp: Date.now() };
        setMessages(p => [...p, msg]);
        socket.emit('chat-message', { text, timestamp: msg.timestamp });
        setDraft('');
    };
    const sendReaction = (emoji) => {
        setReactionPanel(false);
        const id = Date.now().toString();
        setLocalReactions(p => [...p, { id, emoji }]);
        setTimeout(() => setLocalReactions(p => p.filter(r => r.id !== id)), 2500);
        socket?.emit('emoji-reaction', { emoji });
    };

    const deviceLabel = (d) => (d?.label?.replace(/\(.*?\)/g, '').trim() || d?.deviceId?.slice(0, 10) || '—');
    const chatPanelWidth = chatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, IS_MOBILE ? SCREEN_W : 300] });

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={styles.root}>

            {/* ══ LOBBY ══════════════════════════════════════════════════════ */}
            {!currentRoom && (
                <View style={styles.lobby}>
                    <Text style={styles.lobbyTitle}>STANZE VIRTUALI</Text>
                    <Text style={[styles.connStatus, {
                        color: connectionStatus.includes('Errore') ? '#ED4245' :
                            connectionStatus.includes('Connesso') ? '#23A559' : '#D4AF37'
                    }]}>{connectionStatus}</Text>

                    <TouchableOpacity style={styles.createBtn} onPress={() => setCreateRoomVisible(true)} activeOpacity={0.85}>
                        <LinearGradient colors={['#D4AF37', '#A08428']} style={styles.createBtnGrad}>
                            <Icon name="plus" size={18} color="#000" />
                            <Text style={styles.createBtnText}>CREA STANZA</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.roomsBox}>
                        <Text style={styles.roomsBoxTitle}>STANZE DISPONIBILI</Text>
                        {availableRooms.length === 0
                            ? <Text style={styles.noRooms}>Nessuna stanza disponibile.</Text>
                            : <FlatList data={availableRooms} keyExtractor={i => i.id} showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => (
                                    <View style={styles.roomRow}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={styles.roomName}>{item.name}</Text>
                                                {item.isTemp && <View style={styles.tempBadge}><Text style={styles.tempBadgeText}>TEMP</Text></View>}
                                            </View>
                                            <Text style={styles.roomCreator}>@{item.creatorName}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.joinBtn} onPress={() => joinRoom(item.id)}>
                                            <Text style={styles.joinBtnText}>ENTRA</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        }
                    </View>

                    <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                        <Icon name="log-out" size={16} color="#ED4245" />
                        <Text style={styles.logoutText}>Esci</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ══ IN-CALL ═════════════════════════════════════════════════════ */}
            {currentRoom && (
                <View style={styles.callLayout}>

                    {/* Video area */}
                    <View style={styles.videoArea}>
                        {/* Room badge top-left */}
                        <View style={styles.roomBadge}>
                            <Icon name="hash" size={12} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.roomBadgeText}>{currentRoom}</Text>
                            {isTemp && <View style={styles.tempBadge}><Text style={styles.tempBadgeText}>TEMP</Text></View>}
                        </View>

                        {/* Grid / Focus layout */}
                        <View style={styles.videoGrid}>
                            {focusedUser ? (
                                // Focus mode
                                <View style={styles.focusLayout}>
                                    <View style={styles.focusPrimary}>
                                        <ParticipantTile
                                            stream={focusedUser === 'local' ? localStream : remoteStream}
                                            isLocal={focusedUser === 'local'}
                                            username={focusedUser === 'local' ? user.username : remoteData.username}
                                            isMuted={focusedUser === 'local' ? isMicMuted : remoteData.isMuted}
                                            isCamOff={focusedUser === 'local' ? isCamMuted : remoteData.isCamOff}
                                            isSpeaking={focusedUser === 'local' ? isLocalSpeaking : remoteData.isSpeaking}
                                            isHandRaised={focusedUser === 'local' ? isHandRaised : remoteData.isHandRaised}
                                            reactions={focusedUser === 'local' ? localReactions : remoteReactions}
                                            onPress={() => setFocusedUser(null)}
                                        />
                                    </View>
                                    <View style={styles.focusSidebar}>
                                        {focusedUser !== 'local' && (
                                            <View style={styles.sideThumb}>
                                                <ParticipantTile stream={localStream} isLocal username={user.username} isMuted={isMicMuted} isCamOff={isCamMuted} isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised} reactions={localReactions} onPress={() => setFocusedUser('local')} />
                                            </View>
                                        )}
                                        {focusedUser !== 'remote' && remoteStream && (
                                            <View style={styles.sideThumb}>
                                                <ParticipantTile stream={remoteStream} isLocal={false} username={remoteData.username} isMuted={remoteData.isMuted} isCamOff={remoteData.isCamOff} isSpeaking={remoteData.isSpeaking} isHandRaised={remoteData.isHandRaised} reactions={remoteReactions} onPress={() => setFocusedUser('remote')} />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                // Grid mode — centered, 16:9
                                <View style={styles.gridLayout}>
                                    <View style={styles.gridTileWrap}>
                                        <ParticipantTile stream={localStream} isLocal username={user.username} isMuted={isMicMuted} isCamOff={isCamMuted} isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised} reactions={localReactions} onPress={() => setFocusedUser('local')} />
                                    </View>
                                    {remoteStream && (
                                        <View style={styles.gridTileWrap}>
                                            <ParticipantTile stream={remoteStream} isLocal={false} username={remoteData.username} isMuted={remoteData.isMuted} isCamOff={remoteData.isCamOff} isSpeaking={remoteData.isSpeaking} isHandRaised={remoteData.isHandRaised} reactions={remoteReactions} onPress={() => setFocusedUser('remote')} />
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* ── Control Bar ───────────────────────────────────── */}
                        <View style={styles.controlWrap}>
                            <View style={styles.controlBar}>
                                {/* MIC */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isMicMuted && styles.ctrlDanger]} onPress={toggleMic}>
                                        <Icon name={isMicMuted ? 'mic-off' : 'mic'} size={18} color={isMicMuted ? '#ED4245' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setMicDropdown(!micDropdown); setCamDropdown(false); setReactionPanel(false); }}>
                                        <Icon name="chevron-down" size={10} color="#72767D" />
                                    </TouchableOpacity>
                                    {micDropdown && (
                                        <View style={styles.deviceDrop}>
                                            <Text style={styles.deviceDropTitle}>MICROFONO</Text>
                                            {audioInputs.map(d => (
                                                <TouchableOpacity key={d.deviceId} style={[styles.deviceOpt, selAudioIn === d.deviceId && styles.deviceOptActive]} onPress={() => { setSelAudioIn(d.deviceId); startLocalStream(selVideo || null, d.deviceId); setMicDropdown(false); }}>
                                                    <Icon name="mic" size={13} color={selAudioIn === d.deviceId ? '#D4AF37' : '#72767D'} />
                                                    <Text style={[styles.deviceOptText, selAudioIn === d.deviceId && { color: '#D4AF37' }]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                            {audioOutputs.length > 0 && <>
                                                <View style={styles.deviceDropSep} />
                                                <Text style={styles.deviceDropTitle}>ALTOPARLANTE</Text>
                                                {audioOutputs.map(d => (
                                                    <TouchableOpacity key={d.deviceId} style={[styles.deviceOpt, selAudioOut === d.deviceId && styles.deviceOptActive]} onPress={() => { setSelAudioOut(d.deviceId); setMicDropdown(false); }}>
                                                        <Icon name="headphones" size={13} color={selAudioOut === d.deviceId ? '#D4AF37' : '#72767D'} />
                                                        <Text style={[styles.deviceOptText, selAudioOut === d.deviceId && { color: '#D4AF37' }]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </>}
                                        </View>
                                    )}
                                </View>

                                {/* CAMERA */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isCamMuted && styles.ctrlDanger]} onPress={toggleCam}>
                                        <Icon name={isCamMuted ? 'video-off' : 'video'} size={18} color={isCamMuted ? '#ED4245' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setCamDropdown(!camDropdown); setMicDropdown(false); setReactionPanel(false); }}>
                                        <Icon name="chevron-down" size={10} color="#72767D" />
                                    </TouchableOpacity>
                                    {camDropdown && (
                                        <View style={styles.deviceDrop}>
                                            <Text style={styles.deviceDropTitle}>FOTOCAMERA</Text>
                                            {videoInputs.map(d => (
                                                <TouchableOpacity key={d.deviceId} style={[styles.deviceOpt, selVideo === d.deviceId && styles.deviceOptActive]} onPress={() => { setSelVideo(d.deviceId); startLocalStream(d.deviceId, selAudioIn || null); setCamDropdown(false); }}>
                                                    <Icon name="camera" size={13} color={selVideo === d.deviceId ? '#D4AF37' : '#72767D'} />
                                                    <Text style={[styles.deviceOptText, selVideo === d.deviceId && { color: '#D4AF37' }]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.ctrlSep} />

                                {/* Hand + reaction picker */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isHandRaised && styles.ctrlGold]} onPress={toggleHandRaise}>
                                        <Icon name="hand" size={18} color={isHandRaised ? '#D4AF37' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setReactionPanel(!reactionPanel); setMicDropdown(false); setCamDropdown(false); }}>
                                        <Icon name="smile" size={13} color="#72767D" />
                                    </TouchableOpacity>
                                    {reactionPanel && (
                                        <View style={[styles.deviceDrop, { width: 300 }]}>
                                            <EmojiPanel onSelect={sendReaction} onClose={() => setReactionPanel(false)} />
                                        </View>
                                    )}
                                </View>

                                {/* Screen share placeholder */}
                                <TouchableOpacity style={styles.ctrlBtn} onPress={() => alert('Screen share in arrivo!')} activeOpacity={0.8}>
                                    <Icon name="share-screen" size={18} color="#B5BAC1" />
                                </TouchableOpacity>

                                {/* Settings */}
                                <TouchableOpacity style={styles.ctrlBtn} onPress={() => setSettingsVisible(true)}>
                                    <Icon name="settings" size={18} color="#B5BAC1" />
                                </TouchableOpacity>

                                <View style={styles.ctrlSep} />

                                {/* End call */}
                                <TouchableOpacity style={styles.ctrlEndCall} onPress={leaveRoom}>
                                    <Icon name="phone-off" size={18} color="#FFF" />
                                </TouchableOpacity>
                            </View>

                            {/* Chat toggle */}
                            <TouchableOpacity style={[styles.chatToggle, chatVisible && styles.chatToggleActive]} onPress={() => setChatVisible(!chatVisible)}>
                                <Icon name="message-square" size={18} color={chatVisible ? '#D4AF37' : '#B5BAC1'} />
                                {unread > 0 && !chatVisible && (
                                    <View style={styles.unreadDot}><Text style={styles.unreadDotText}>{unread}</Text></View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Chat panel */}
                    <Animated.View style={[styles.chatPanel, { width: chatPanelWidth, overflow: 'hidden' }]}>
                        <View style={[styles.chatInner, { width: IS_MOBILE ? SCREEN_W : 300 }]}>
                            <View style={styles.chatHeader}>
                                <Text style={styles.chatTitle}>Chat</Text>
                                <TouchableOpacity onPress={() => setChatVisible(false)}><Icon name="x" size={16} color="#72767D" /></TouchableOpacity>
                            </View>
                            <ScrollView ref={chatScrollRef} style={styles.chatMessages} contentContainerStyle={{ paddingBottom: 8 }}
                                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
                                {messages.length === 0 && <Text style={styles.chatEmpty}>Nessun messaggio.</Text>}
                                {messages.map((m, i) => (
                                    <View key={i} style={styles.chatMsg}>
                                        <Text style={styles.chatMsgSender}>{m.sender} </Text>
                                        <Text style={styles.chatMsgText}>{m.text}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                            <View style={styles.chatInputRow}>
                                <TouchableOpacity style={styles.chatEmojiBtnInline} onPress={() => setEmojiPanel(!emojiPanel)}>
                                    <Icon name="smile" size={16} color="#72767D" />
                                </TouchableOpacity>
                                <TextInput style={styles.chatInput} value={draft} onChangeText={setDraft}
                                    placeholder="Scrivi..." placeholderTextColor="#72767D"
                                    onSubmitEditing={sendMessage} returnKeyType="send" blurOnSubmit={false} />
                                <TouchableOpacity style={styles.chatSendBtn} onPress={sendMessage}>
                                    <Icon name="send" size={14} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                            {emojiPanel && (
                                <View style={styles.chatEmojiPickerWrap}>
                                    <EmojiPanel onSelect={(e) => setDraft(d => d + e)} onClose={() => setEmojiPanel(false)} />
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </View>
            )}

            {/* Modals */}
            <CreateRoomModal visible={createRoomVisible} onClose={() => setCreateRoomVisible(false)} onConfirm={createRoom} />
            <MediaSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} user={user} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#111214' },

    // LOBBY
    lobby: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
    lobbyTitle: { color: '#FFF', fontSize: 22, fontWeight: '200', letterSpacing: 6 },
    connStatus: { fontSize: 12 },
    createBtn: { width: 240, height: 50, borderRadius: 25, overflow: 'hidden' },
    createBtnGrad: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    createBtnText: { color: '#000', fontWeight: '700', letterSpacing: 3, fontSize: 13 },

    roomsBox: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    roomsBoxTitle: { color: '#72767D', fontSize: 10, letterSpacing: 3, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    noRooms: { color: '#4F545C', textAlign: 'center', fontStyle: 'italic', paddingVertical: 16 },
    roomRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    roomName: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
    roomCreator: { color: '#72767D', fontSize: 12, marginTop: 2 },
    joinBtn: { backgroundColor: 'rgba(212,175,55,0.15)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
    joinBtnText: { color: '#D4AF37', fontSize: 11, fontWeight: '700' },
    tempBadge: { backgroundColor: 'rgba(250,166,26,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tempBadgeText: { color: '#FAA61A', fontSize: 9, fontWeight: '700' },
    settingsLobbyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    settingsLobbyText: { color: '#72767D', fontSize: 13 },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    logoutText: { color: '#ED4245', fontSize: 13, fontWeight: '600' },

    // IN-CALL layout
    callLayout: { flex: 1, flexDirection: 'row' },
    videoArea: { flex: 1, backgroundColor: '#111214', position: 'relative' },

    roomBadge: { position: 'absolute', top: 14, left: 14, zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    roomBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },

    // Video layouts — always 16:9 using aspectRatio
    videoGrid: { flex: 1, padding: 16, paddingTop: 56, paddingBottom: 100, justifyContent: 'center', alignItems: 'center' },
    gridLayout: { width: '100%', maxWidth: 1100, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    gridTileWrap: { flex: 1, minWidth: IS_MOBILE ? '100%' : 280, maxWidth: '50%', aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1E1F22' },

    focusLayout: { flex: 1, width: '100%', flexDirection: IS_MOBILE ? 'column' : 'row', gap: 10 },
    focusPrimary: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1E1F22', aspectRatio: IS_MOBILE ? 16 / 9 : undefined },
    focusSidebar: { width: IS_MOBILE ? '100%' : 160, flexDirection: IS_MOBILE ? 'row' : 'column', gap: 8 },
    sideThumb: { flex: IS_MOBILE ? 1 : undefined, width: IS_MOBILE ? undefined : '100%', aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1E1F22' },

    tile: { flex: 1, width: '100%', height: '100%', position: 'relative', borderWidth: 2, borderColor: 'transparent', borderRadius: 10 },
    tileSpeaking: { borderColor: '#5865F2' },
    tileVideo: { flex: 1, width: '100%', height: '100%' },
    tileAvatar: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2B2D31' },
    tileAvatarCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#5865F2', justifyContent: 'center', alignItems: 'center' },
    tileAvatarText: { color: '#FFF', fontSize: 28, fontWeight: '700' },
    tileReactions: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
    tileBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
    tileBarLeft: { flexDirection: 'row', gap: 4 },
    tileIndicator: { width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    tileName: { color: '#FFF', fontSize: 12, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },

    // Control bar
    controlWrap: { position: 'absolute', bottom: 20, width: '100%', alignItems: 'center', zIndex: 100 },
    controlBar: {
        flexDirection: 'row', alignItems: 'center', gap: 2,
        backgroundColor: '#1E1F22', paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    ctrlGroup: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
    ctrlBtn: { padding: 10, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    ctrlDanger: { backgroundColor: 'rgba(237,66,69,0.1)' },
    ctrlGold: { backgroundColor: 'rgba(212,175,55,0.1)' },
    ctrlArrow: { padding: 6, justifyContent: 'center', alignItems: 'center' },
    ctrlSep: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 4 },
    ctrlEndCall: { backgroundColor: '#ED4245', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },

    chatToggle: { position: 'absolute', right: 16, padding: 10, borderRadius: 8, backgroundColor: '#1E1F22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    chatToggleActive: { backgroundColor: 'rgba(212,175,55,0.1)', borderColor: 'rgba(212,175,55,0.3)' },
    unreadDot: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ED4245', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    unreadDotText: { color: '#FFF', fontSize: 9, fontWeight: '800' },

    // Device dropdowns
    deviceDrop: { position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 240, backgroundColor: '#2B2D31', borderRadius: 8, padding: 6, zIndex: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    deviceDropTitle: { color: '#72767D', fontSize: 9, letterSpacing: 2, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 5 },
    deviceDropSep: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 4 },
    deviceOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 4 },
    deviceOptActive: { backgroundColor: 'rgba(212,175,55,0.08)' },
    deviceOptText: { color: '#B5BAC1', fontSize: 13, flex: 1 },

    // Emoji panel
    emojiPanel: { backgroundColor: '#2B2D31', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    emojiPanelSearch: { backgroundColor: '#1E1F22', borderRadius: 6, paddingHorizontal: 10, marginBottom: 6 },
    emojiSearchInput: { color: '#DCDDDE', paddingVertical: 7, fontSize: 13, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
    emojiTabBtn: { paddingHorizontal: 10, paddingVertical: 5 },
    emojiTabActive: { borderBottomWidth: 2, borderBottomColor: '#D4AF37' },
    emojiTabLabel: { color: '#72767D', fontSize: 10, fontWeight: '700' },
    emojiInnerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    emojiCell: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },

    // Chat panel
    chatPanel: { backgroundColor: '#1E1F22', borderLeftWidth: 1, borderLeftColor: 'rgba(0,0,0,0.2)' },
    chatInner: { flex: 1, flexDirection: 'column' },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    chatTitle: { color: '#DCDDDE', fontWeight: '700', fontSize: 14 },
    chatMessages: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
    chatEmpty: { color: '#4F545C', textAlign: 'center', marginTop: 30, fontStyle: 'italic', fontSize: 13 },
    chatMsg: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    chatMsgSender: { color: '#D4AF37', fontWeight: '700', fontSize: 13 },
    chatMsgText: { color: '#DCDDDE', fontSize: 13 },
    chatInputRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 6 },
    chatEmojiBtnInline: { padding: 4 },
    chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: '#DCDDDE', fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
    chatSendBtn: { backgroundColor: '#5865F2', width: 32, height: 32, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    chatEmojiPickerWrap: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },

    // Create Room modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    createRoomModal: { width: '100%', maxWidth: 420, backgroundColor: '#2B2D31', borderRadius: 12, padding: 24, gap: 14 },
    createRoomTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
    roomTypeBtn: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    roomTypeBtnActive: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.06)' },
    roomTypeLabel: { color: '#DCDDDE', fontWeight: '600', fontSize: 14, marginBottom: 3 },
    roomTypeDesc: { color: '#72767D', fontSize: 12, lineHeight: 18 },
    createRoomActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    createRoomCancel: { paddingHorizontal: 16, paddingVertical: 10 },
    createRoomConfirm: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
});
