/**
 * CallScreen.js — v2.2.0
 * Discord-inspired video room UI.
 * - Flat SVG icons (no emoji icons)
 * - Device dropdown menus for mic/speaker and camera
 * - Emoji reaction picker
 * - Smooth CSS animations
 * - Profile-only settings
 * - Fixed double-message bug
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Platform, Dimensions, TextInput, ScrollView, Animated
} from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import io from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import MediaSettings from './MediaSettings';
import { Icon } from './Icons';

const { width, height } = Dimensions.get('window');
const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';

// All available emoji for reactions
const EMOJI_LIST = [
    '👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯',
    '✅', '👏', '🤔', '😍', '🥳', '😎', '🤩', '😤', '💪', '🙏',
    '🌟', '🚀', '💡', '🎯', '🤝', '😴', '🤮', '💀', '👻', '🎊',
];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

// ─── Helper Components ─────────────────────────────────────────────────────────

/** A floating emoji that appears on a video tile then fades out */
const ReactionBubble = ({ emoji, onDone }) => {
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const moveAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
            Animated.timing(moveAnim, { toValue: -60, duration: 2000, useNativeDriver: true }),
        ]).start(onDone);
    }, []);

    return (
        <Animated.View style={[styles.reactionBubble, { opacity: fadeAnim, transform: [{ translateY: moveAnim }] }]}>
            <Text style={styles.reactionEmoji}>{emoji}</Text>
        </Animated.View>
    );
};

/** Participant video tile */
const ParticipantVideo = ({ stream, isLocal, username, isFocused, onPress, isMicMuted, isCamMuted, isSpeaking, isHandRaised, reactions }) => {
    return (
        <TouchableOpacity
            activeOpacity={0.95}
            onPress={onPress}
            style={[styles.participantContainer, isSpeaking && styles.speakingBorder]}
        >
            {stream && !isCamMuted ? (
                <RTCView
                    streamURL={stream}
                    style={styles.participantVideo}
                    objectFit="cover"
                    mirror={isLocal}
                />
            ) : (
                <View style={styles.avatarFallback}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{username ? username.charAt(0).toUpperCase() : '?'}</Text>
                    </View>
                </View>
            )}

            {/* Floating reactions */}
            <View style={styles.reactionArea} pointerEvents="none">
                {(reactions || []).map(r => (
                    <ReactionBubble key={r.id} emoji={r.emoji} onDone={() => { }} />
                ))}
            </View>

            {/* Bottom overlay: name + indicators */}
            <View style={styles.tileOverlay}>
                <View style={styles.tileLeft}>
                    {isMicMuted && (
                        <View style={styles.tileIndicator}>
                            <Icon name="mic-off" size={12} color="#FF4B4B" />
                        </View>
                    )}
                    {isHandRaised && (
                        <View style={[styles.tileIndicator, styles.tileIndicatorGold]}>
                            <Icon name="hand" size={12} color="#D4AF37" />
                        </View>
                    )}
                </View>
                <Text style={styles.tileName}>{username || 'Guest'}{isLocal ? ' (Tu)' : ''}</Text>
            </View>
        </TouchableOpacity>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CallScreen({ user, onLogout }) {
    // ── Socket & Connection ──────────────────────────────────────────────────
    const socketRef = useRef(null);
    const [connectionStatus, setConnectionStatus] = useState('Connessione...');

    // ── Room State ───────────────────────────────────────────────────────────
    const [availableRooms, setAvailableRooms] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);

    // ── Media ────────────────────────────────────────────────────────────────
    const [localStream, setLocalStream] = useState(null);
    const localStreamRef = useRef(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCamMuted, setIsCamMuted] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
    const vadInterval = useRef(null);

    // ── Devices ──────────────────────────────────────────────────────────────
    const [audioInputDevices, setAudioInputDevices] = useState([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState([]);
    const [videoDevices, setVideoDevices] = useState([]);
    const [selectedAudioInput, setSelectedAudioInput] = useState('');
    const [selectedAudioOutput, setSelectedAudioOutput] = useState('');
    const [selectedVideo, setSelectedVideo] = useState('');
    const [micMenuVisible, setMicMenuVisible] = useState(false);
    const [camMenuVisible, setCamMenuVisible] = useState(false);

    // ── Remote User ──────────────────────────────────────────────────────────
    const [remoteUserData, setRemoteUserData] = useState({
        username: '', isMicMuted: false, isCamMuted: false, isHandRaised: false, isSpeaking: false
    });

    // ── UI State ─────────────────────────────────────────────────────────────
    const [profileMenuVisible, setProfileMenuVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [focusedUserId, setFocusedUserId] = useState(null);
    const [isHandRaised, setIsHandRaised] = useState(false);

    // ── Chat ─────────────────────────────────────────────────────────────────
    const [chatVisible, setChatVisible] = useState(false);
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatDraft, setChatDraft] = useState('');
    const chatScrollRef = useRef(null);
    const chatAnim = useRef(new Animated.Value(0)).current; // 0=hidden 1=visible

    // ── Emoji Reactions ──────────────────────────────────────────────────────
    const [emojiMenuVisible, setEmojiMenuVisible] = useState(false);
    const [localReactions, setLocalReactions] = useState([]);
    const [remoteReactions, setRemoteReactions] = useState([]);

    // ── WebRTC ───────────────────────────────────────────────────────────────
    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const currentPeerId = useRef(null);
    const pendingCandidates = useRef([]);

    // ─────────────────────────────────────────────────────────────────────────
    // Setup socket + listeners
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`${SIGNALING_URL}/ping`)
            .then(() => setConnectionStatus('Connesso 🟢'))
            .catch(() => setConnectionStatus('Errore Server 🔴'));

        const s = io(SIGNALING_URL);
        socketRef.current = s;

        s.on('connect', () => {
            setConnectionStatus('Connesso 🟢');
            s.emit('join', user);
        });
        s.on('connect_error', (err) => setConnectionStatus(`Errore: ${err.message}`));
        s.on('disconnect', () => setConnectionStatus('Disconnesso'));

        s.on('force-disconnect', (data) => {
            alert(`Disconnesso: ${data.reason}`);
            s.disconnect();
            onLogout();
        });

        s.on('rooms-update', (rooms) => setAvailableRooms(rooms));

        s.on('room-created', ({ roomId }) => setCurrentRoom(roomId));

        s.on('room-joined', async ({ roomId, peers }) => {
            setCurrentRoom(roomId);
            const creatorId = peers.find(id => id !== s.id);
            if (creatorId) await startCall(creatorId, s);
        });

        s.on('room-error', ({ message }) => alert(`Errore: ${message}`));

        s.on('user-joined-room', ({ username }) => {
            setRemoteUserData(prev => ({ ...prev, username }));
        });

        s.on('user-left-room', () => {
            peerConnection.current?.close();
            peerConnection.current = null;
            setRemoteStream(null);
            currentPeerId.current = null;
            setCurrentRoom(null);
            alert("L'altro utente ha abbandonato la stanza.");
        });

        s.on('media-state-change', (data) => {
            setRemoteUserData(prev => ({
                ...prev,
                isMicMuted: data.isMicMuted !== undefined ? data.isMicMuted : prev.isMicMuted,
                isCamMuted: data.isCamMuted !== undefined ? data.isCamMuted : prev.isCamMuted,
                isSpeaking: data.isSpeaking !== undefined ? data.isSpeaking : prev.isSpeaking,
            }));
        });

        s.on('hand-raise', (data) => {
            setRemoteUserData(prev => ({ ...prev, isHandRaised: data.isRaised }));
        });

        // Chat: server now uses socket.to (excludes sender), so this only fires for OTHER users
        s.on('chat-message', (data) => {
            setMessages(prev => [...prev, data]);
            setUnreadCount(prev => (chatVisible ? 0 : prev + 1));
        });

        // Emoji reaction from remote
        s.on('emoji-reaction', ({ emoji }) => {
            const id = Date.now().toString();
            setRemoteReactions(prev => [...prev, { id, emoji }]);
            setTimeout(() => setRemoteReactions(prev => prev.filter(r => r.id !== id)), 2500);
        });

        s.on('offer', async (data) => {
            if (!peerConnection.current) createPeerConnection(data.caller, s);
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates();
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            s.emit('answer', { target: data.caller, caller: s.id, sdp: answer });
            currentPeerId.current = data.caller;
        });

        s.on('answer', async (data) => {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates();
        });

        s.on('ice-candidate', async (data) => {
            if (peerConnection.current?.remoteDescription) {
                try { await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate)); }
                catch (e) { console.error('ICE error', e); }
            } else {
                pendingCandidates.current.push(data.candidate);
            }
        });

        startLocalStream();
        loadDevices();

        return () => {
            s.disconnect();
            peerConnection.current?.close();
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            if (vadInterval.current) clearInterval(vadInterval.current);
        };
    }, []);

    // Animate chat panel
    useEffect(() => {
        Animated.spring(chatAnim, {
            toValue: chatVisible ? 1 : 0,
            damping: 15,
            stiffness: 120,
            useNativeDriver: false,
        }).start();
        if (chatVisible) setUnreadCount(0);
    }, [chatVisible]);

    // ─────────────────────────────────────────────────────────────────────────
    // Device Management
    // ─────────────────────────────────────────────────────────────────────────
    const loadDevices = async () => {
        if (Platform.OS !== 'web') return;
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const aIn = all.filter(d => d.kind === 'audioinput');
            const aOut = all.filter(d => d.kind === 'audiooutput');
            const vid = all.filter(d => d.kind === 'videoinput');
            setAudioInputDevices(aIn);
            setAudioOutputDevices(aOut);
            setVideoDevices(vid);
            if (aIn[0] && !selectedAudioInput) setSelectedAudioInput(aIn[0].deviceId);
            if (aOut[0] && !selectedAudioOutput) setSelectedAudioOutput(aOut[0].deviceId);
            if (vid[0] && !selectedVideo) setSelectedVideo(vid[0].deviceId);
        } catch (e) {
            console.log('Device enum not available');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Media / WebRTC
    // ─────────────────────────────────────────────────────────────────────────
    const startLocalStream = async (videoDeviceId = null, audioDeviceId = null) => {
        try {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            const stream = await mediaDevices.getUserMedia({
                audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
                video: videoDeviceId ? { deviceId: videoDeviceId } : true,
            });
            setLocalStream(stream);
            localStreamRef.current = stream;
            if (peerConnection.current) {
                const senders = peerConnection.current.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track?.kind === track.kind);
                    sender ? sender.replaceTrack(track) : peerConnection.current.addTrack(track, stream);
                });
            }
            setupVAD(stream);
        } catch (e) {
            console.warn('Media access failed:', e.message);
        }
    };

    const setupVAD = (stream) => {
        try {
            if (Platform.OS === 'web' && typeof AudioContext !== 'undefined') {
                const ctx = new AudioContext();
                const analyser = ctx.createAnalyser();
                ctx.createMediaStreamSource(stream).connect(analyser);
                analyser.fftSize = 256;
                const data = new Uint8Array(analyser.frequencyBinCount);
                if (vadInterval.current) clearInterval(vadInterval.current);
                vadInterval.current = setInterval(() => {
                    analyser.getByteFrequencyData(data);
                    const avg = data.reduce((a, b) => a + b, 0) / data.length;
                    setIsLocalSpeaking(avg > 15);
                }, 150);
            }
        } catch (_) { }
    };

    const processPendingCandidates = () => {
        if (peerConnection.current?.remoteDescription) {
            pendingCandidates.current.forEach(async (c) => {
                try { await peerConnection.current.addIceCandidate(new RTCIceCandidate(c)); }
                catch (e) { console.error('Queued ICE error', e); }
            });
            pendingCandidates.current = [];
        }
    };

    const createPeerConnection = (targetId, s) => {
        const pc = new RTCPeerConnection(configuration);
        const dc = pc.createDataChannel('meta');
        dataChannel.current = dc;
        pc.ondatachannel = (e) => { dataChannel.current = e.channel; };
        pc.onicecandidate = (e) => {
            if (e.candidate) s.emit('ice-candidate', { target: targetId, candidate: e.candidate });
        };
        pc.ontrack = (e) => {
            if (e.streams?.[0]) setRemoteStream(e.streams[0]);
        };
        pc.onaddstream = (e) => setRemoteStream(e.stream);
        localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
        peerConnection.current = pc;
    };

    const startCall = async (targetId, s) => {
        createPeerConnection(targetId, s);
        currentPeerId.current = targetId;
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        s.emit('offer', { target: targetId, caller: s.id, sdp: offer });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Room Actions
    // ─────────────────────────────────────────────────────────────────────────
    const createRoom = () => socketRef.current?.emit('create-room');

    const joinRoom = (roomId) => socketRef.current?.emit('join-room', { roomId });

    const leaveRoom = () => {
        socketRef.current?.emit('leave-room');
        peerConnection.current?.close();
        peerConnection.current = null;
        setRemoteStream(null);
        currentPeerId.current = null;
        setCurrentRoom(null);
        setFocusedUserId(null);
        setChatVisible(false);
        setMessages([]);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Controls
    // ─────────────────────────────────────────────────────────────────────────
    const toggleMic = () => {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            const muted = !track.enabled;
            setIsMicMuted(muted);
            socketRef.current?.emit('media-state-change', { isMicMuted: muted, isCamMuted });
        }
    };

    const toggleCam = () => {
        const track = localStreamRef.current?.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            const muted = !track.enabled;
            setIsCamMuted(muted);
            socketRef.current?.emit('media-state-change', { isMicMuted, isCamMuted: muted });
        }
    };

    const toggleHandRaise = () => {
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        socketRef.current?.emit('hand-raise', { isRaised: newState });
    };

    const switchAudioInput = async (deviceId) => {
        setSelectedAudioInput(deviceId);
        setMicMenuVisible(false);
        await startLocalStream(selectedVideo || null, deviceId);
    };

    const switchVideo = async (deviceId) => {
        setSelectedVideo(deviceId);
        setCamMenuVisible(false);
        await startLocalStream(deviceId, selectedAudioInput || null);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Chat — FIX: only add locally, server now uses socket.to (no echo)
    // ─────────────────────────────────────────────────────────────────────────
    const sendChatMessage = () => {
        const text = chatDraft.trim();
        if (!text || !socketRef.current) return;
        const msg = { sender: user.username, text, timestamp: Date.now() };
        // Add locally
        setMessages(prev => [...prev, msg]);
        // Emit to server (server will broadcast to OTHERS only via socket.to)
        socketRef.current.emit('chat-message', { text, timestamp: msg.timestamp });
        setChatDraft('');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Emoji Reactions
    // ─────────────────────────────────────────────────────────────────────────
    const sendEmojiReaction = (emoji) => {
        setEmojiMenuVisible(false);
        // Show locally
        const id = Date.now().toString();
        setLocalReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setLocalReactions(prev => prev.filter(r => r.id !== id)), 2500);
        // Send to remote
        socketRef.current?.emit('emoji-reaction', { emoji });
    };

    const updateMediaDevices = ({ videoDeviceId, audioDeviceId }) => {
        startLocalStream(videoDeviceId, audioDeviceId);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render helpers
    // ─────────────────────────────────────────────────────────────────────────
    const chatWidth = chatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });

    // Device label helpers
    const deviceLabel = (d) => d?.label?.replace(/\(.*?\)/g, '').trim() || d?.deviceId?.slice(0, 8) || 'Dispositivo';

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.root} onStartShouldSetResponder={() => {
            if (micMenuVisible) setMicMenuVisible(false);
            if (camMenuVisible) setCamMenuVisible(false);
            if (emojiMenuVisible) setEmojiMenuVisible(false);
            if (profileMenuVisible) setProfileMenuVisible(false);
            return false;
        }}>

            {/* ── LOBBY ─────────────────────────────────────────────────── */}
            {!currentRoom && (
                <View style={styles.lobbyContainer}>
                    <View style={styles.lobbyContent}>
                        {/* Header */}
                        <View style={styles.headerContainer}>
                            <Text style={styles.logoText}>RECEPTION</Text>
                            <Text style={styles.waitingText}>STANZE VIRTUALI</Text>
                            <Text style={[styles.diagnosticText, {
                                color: connectionStatus.includes('Errore') ? '#FF4B4B'
                                    : connectionStatus.includes('Connesso') ? '#4BFF4B' : '#D4AF37'
                            }]}>{connectionStatus}</Text>
                        </View>

                        {/* Create room button */}
                        <TouchableOpacity style={styles.createRoomBtn} onPress={createRoom} activeOpacity={0.85}>
                            <LinearGradient colors={['#D4AF37', '#A0892A']} style={styles.createBtnGradient}>
                                <Text style={styles.createBtnText}>CREA STANZA</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Room list */}
                        <View style={styles.roomsListContainer}>
                            <Text style={styles.roomsListTitle}>STANZE DISPONIBILI</Text>
                            {availableRooms.length === 0 ? (
                                <Text style={styles.noRoomsText}>Nessuna stanza disponibile.</Text>
                            ) : (
                                <FlatList
                                    data={availableRooms}
                                    keyExtractor={item => item.id}
                                    showsVerticalScrollIndicator={false}
                                    renderItem={({ item }) => (
                                        <View style={styles.roomRow}>
                                            <View>
                                                <Text style={styles.roomName}>{item.name}</Text>
                                                <Text style={styles.roomCreator}>@{item.creatorName}</Text>
                                            </View>
                                            <TouchableOpacity style={styles.joinBtn} onPress={() => joinRoom(item.id)} activeOpacity={0.8}>
                                                <LinearGradient colors={['rgba(212,175,55,0.25)', 'rgba(212,175,55,0.1)']} style={styles.joinBtnGradient}>
                                                    <Text style={styles.joinBtnText}>ENTRA</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                />
                            )}
                        </View>
                    </View>

                    {/* Profile avatar (top-right) */}
                    <View style={styles.profileContainer}>
                        <TouchableOpacity onPress={() => setProfileMenuVisible(!profileMenuVisible)} style={styles.profileAvatar} activeOpacity={0.8}>
                            <LinearGradient colors={['#D4AF37', '#7A6520']} style={styles.profileAvatarGradient}>
                                <Text style={styles.profileAvatarText}>{user.username.charAt(0).toUpperCase()}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {profileMenuVisible && (
                            <View style={styles.profileDropdown}>
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); setSettingsVisible(true); }}>
                                    <Icon name="settings" size={16} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.dropdownItemText}>Impostazioni</Text>
                                </TouchableOpacity>
                                <View style={styles.dropdownDivider} />
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); onLogout(); }}>
                                    <Icon name="log-out" size={16} color="#FF4B4B" />
                                    <Text style={[styles.dropdownItemText, { color: '#FF4B4B' }]}>Esci</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* ── IN-CALL ───────────────────────────────────────────────── */}
            {currentRoom && (
                <View style={styles.callLayout}>

                    {/* Video Area */}
                    <View style={styles.mainVideoArea}>

                        {/* Top Bar — Only room code, no abandon button */}
                        <View style={styles.topCallBar}>
                            <View style={styles.roomCodeBadge}>
                                <Text style={styles.roomCodeText}>#{currentRoom}</Text>
                            </View>
                        </View>

                        {/* Video Grid */}
                        <View style={styles.gridContainer}>
                            {focusedUserId ? (
                                // Focus Mode
                                <View style={styles.focusLayout}>
                                    <View style={styles.focusedVideoWrapper}>
                                        <ParticipantVideo
                                            stream={focusedUserId === 'local' ? localStream : remoteStream}
                                            isLocal={focusedUserId === 'local'}
                                            username={focusedUserId === 'local' ? user.username : remoteUserData.username}
                                            isFocused={true}
                                            isMicMuted={focusedUserId === 'local' ? isMicMuted : remoteUserData.isMicMuted}
                                            isCamMuted={focusedUserId === 'local' ? isCamMuted : remoteUserData.isCamMuted}
                                            isSpeaking={focusedUserId === 'local' ? isLocalSpeaking : remoteUserData.isSpeaking}
                                            isHandRaised={focusedUserId === 'local' ? isHandRaised : remoteUserData.isHandRaised}
                                            reactions={focusedUserId === 'local' ? localReactions : remoteReactions}
                                            onPress={() => setFocusedUserId(null)}
                                        />
                                    </View>
                                    {/* Sidebar */}
                                    <View style={styles.sidebarVideos}>
                                        {focusedUserId !== 'local' && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={localStream} isLocal={true} username={user.username}
                                                    isFocused={false} isMicMuted={isMicMuted} isCamMuted={isCamMuted}
                                                    isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised}
                                                    reactions={localReactions}
                                                    onPress={() => setFocusedUserId('local')}
                                                />
                                            </View>
                                        )}
                                        {focusedUserId !== 'remote' && remoteStream && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={remoteStream} isLocal={false} username={remoteUserData.username}
                                                    isFocused={false} isMicMuted={remoteUserData.isMicMuted} isCamMuted={remoteUserData.isCamMuted}
                                                    isSpeaking={remoteUserData.isSpeaking} isHandRaised={remoteUserData.isHandRaised}
                                                    reactions={remoteReactions}
                                                    onPress={() => setFocusedUserId('remote')}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                // Grid Mode
                                <View style={styles.gridLayout}>
                                    <View style={styles.gridVideoWrapper}>
                                        <ParticipantVideo
                                            stream={localStream} isLocal={true} username={user.username}
                                            isFocused={false} isMicMuted={isMicMuted} isCamMuted={isCamMuted}
                                            isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised}
                                            reactions={localReactions}
                                            onPress={() => setFocusedUserId('local')}
                                        />
                                    </View>
                                    {remoteStream && (
                                        <View style={styles.gridVideoWrapper}>
                                            <ParticipantVideo
                                                stream={remoteStream} isLocal={false} username={remoteUserData.username}
                                                isFocused={false} isMicMuted={remoteUserData.isMicMuted} isCamMuted={remoteUserData.isCamMuted}
                                                isSpeaking={remoteUserData.isSpeaking} isHandRaised={remoteUserData.isHandRaised}
                                                reactions={remoteReactions}
                                                onPress={() => setFocusedUserId('remote')}
                                            />
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* ── Control Bar ─────────────────────────────────────── */}
                        <View style={styles.controlBarWrapper}>
                            <View style={styles.controlBar}>

                                {/* MIC group: toggle + dropdown arrow */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isMicMuted && styles.ctrlBtnDanger]} onPress={toggleMic} activeOpacity={0.7}>
                                        <Icon name={isMicMuted ? 'mic-off' : 'mic'} size={20} color={isMicMuted ? '#FF4B4B' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setMicMenuVisible(!micMenuVisible); setCamMenuVisible(false); setEmojiMenuVisible(false); }} activeOpacity={0.7}>
                                        <Icon name="chevron-down" size={10} color="#B5BAC1" />
                                    </TouchableOpacity>

                                    {/* Mic + Speaker dropdown */}
                                    {micMenuVisible && (
                                        <View style={styles.deviceDropdown}>
                                            <Text style={styles.deviceDropdownTitle}>MICROFONO</Text>
                                            {audioInputDevices.map(d => (
                                                <TouchableOpacity key={d.deviceId} style={[styles.deviceOption, selectedAudioInput === d.deviceId && styles.deviceOptionActive]} onPress={() => switchAudioInput(d.deviceId)}>
                                                    <Icon name="mic" size={13} color={selectedAudioInput === d.deviceId ? '#D4AF37' : '#B5BAC1'} />
                                                    <Text style={[styles.deviceOptionText, selectedAudioInput === d.deviceId && styles.deviceOptionTextActive]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                            {audioOutputDevices.length > 0 && (
                                                <>
                                                    <View style={styles.deviceDropdownDivider} />
                                                    <Text style={styles.deviceDropdownTitle}>ALTOPARLANTE</Text>
                                                    {audioOutputDevices.map(d => (
                                                        <TouchableOpacity key={d.deviceId} style={[styles.deviceOption, selectedAudioOutput === d.deviceId && styles.deviceOptionActive]} onPress={() => { setSelectedAudioOutput(d.deviceId); setMicMenuVisible(false); }}>
                                                            <Icon name="headphones" size={13} color={selectedAudioOutput === d.deviceId ? '#D4AF37' : '#B5BAC1'} />
                                                            <Text style={[styles.deviceOptionText, selectedAudioOutput === d.deviceId && styles.deviceOptionTextActive]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </>
                                            )}
                                        </View>
                                    )}
                                </View>

                                {/* CAMERA group: toggle + dropdown */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isCamMuted && styles.ctrlBtnDanger]} onPress={toggleCam} activeOpacity={0.7}>
                                        <Icon name={isCamMuted ? 'video-off' : 'video'} size={20} color={isCamMuted ? '#FF4B4B' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setCamMenuVisible(!camMenuVisible); setMicMenuVisible(false); setEmojiMenuVisible(false); }} activeOpacity={0.7}>
                                        <Icon name="chevron-down" size={10} color="#B5BAC1" />
                                    </TouchableOpacity>

                                    {camMenuVisible && (
                                        <View style={styles.deviceDropdown}>
                                            <Text style={styles.deviceDropdownTitle}>FOTOCAMERA</Text>
                                            {videoDevices.map(d => (
                                                <TouchableOpacity key={d.deviceId} style={[styles.deviceOption, selectedVideo === d.deviceId && styles.deviceOptionActive]} onPress={() => switchVideo(d.deviceId)}>
                                                    <Icon name="camera" size={13} color={selectedVideo === d.deviceId ? '#D4AF37' : '#B5BAC1'} />
                                                    <Text style={[styles.deviceOptionText, selectedVideo === d.deviceId && styles.deviceOptionTextActive]} numberOfLines={1}>{deviceLabel(d)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                {/* Separator */}
                                <View style={styles.ctrlSeparator} />

                                {/* Hand Raise + Emoji Reaction */}
                                <View style={styles.ctrlGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, isHandRaised && styles.ctrlBtnActive]} onPress={toggleHandRaise} activeOpacity={0.7}>
                                        <Icon name="hand" size={20} color={isHandRaised ? '#D4AF37' : '#B5BAC1'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.ctrlArrow} onPress={() => { setEmojiMenuVisible(!emojiMenuVisible); setMicMenuVisible(false); setCamMenuVisible(false); }} activeOpacity={0.7}>
                                        <Icon name="smile" size={14} color="#B5BAC1" />
                                    </TouchableOpacity>

                                    {/* Emoji Picker */}
                                    {emojiMenuVisible && (
                                        <View style={styles.emojiPicker}>
                                            <Text style={styles.deviceDropdownTitle}>REAZIONE</Text>
                                            <View style={styles.emojiGrid}>
                                                {EMOJI_LIST.map(e => (
                                                    <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => sendEmojiReaction(e)}>
                                                        <Text style={styles.emojiBtnText}>{e}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {/* Settings */}
                                <TouchableOpacity style={styles.ctrlBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.7}>
                                    <Icon name="settings" size={20} color="#B5BAC1" />
                                </TouchableOpacity>

                                {/* Separator */}
                                <View style={styles.ctrlSeparator} />

                                {/* End Call */}
                                <TouchableOpacity style={styles.ctrlBtnEndCall} onPress={leaveRoom} activeOpacity={0.8}>
                                    <Icon name="phone-off" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>

                            {/* Chat toggle — right side */}
                            <TouchableOpacity
                                style={[styles.chatToggleBtn, chatVisible && styles.chatToggleBtnActive]}
                                onPress={() => setChatVisible(!chatVisible)}
                            >
                                <Icon name="message-square" size={20} color={chatVisible ? '#D4AF37' : '#B5BAC1'} />
                                {unreadCount > 0 && !chatVisible && (
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadText}>{unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Chat Panel (slides in from right) ─────────────────── */}
                    <Animated.View style={[styles.chatSidePanel, { width: chatWidth, overflow: 'hidden' }]}>
                        <View style={styles.chatInner}>
                            <View style={styles.chatHeader}>
                                <Text style={styles.chatTitle}>Chat</Text>
                                <TouchableOpacity onPress={() => setChatVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Icon name="x" size={18} color="#B5BAC1" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                ref={chatScrollRef}
                                style={styles.chatMessagesArea}
                                contentContainerStyle={{ paddingBottom: 10 }}
                                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
                                showsVerticalScrollIndicator={false}
                            >
                                {messages.length === 0 && (
                                    <Text style={styles.noMessagesText}>Nessun messaggio ancora.</Text>
                                )}
                                {messages.map((m, i) => (
                                    <View key={i} style={styles.chatMessageRow}>
                                        <Text style={styles.chatSender}>{m.sender} </Text>
                                        <Text style={styles.chatText}>{m.text}</Text>
                                    </View>
                                ))}
                            </ScrollView>

                            <View style={styles.chatInputWrapper}>
                                <TextInput
                                    style={styles.chatInput}
                                    placeholder="Scrivi un messaggio..."
                                    placeholderTextColor="rgba(255,255,255,0.25)"
                                    value={chatDraft}
                                    onChangeText={setChatDraft}
                                    onSubmitEditing={sendChatMessage}
                                    returnKeyType="send"
                                    blurOnSubmit={false}
                                />
                                <TouchableOpacity style={styles.chatSendBtn} onPress={sendChatMessage} activeOpacity={0.8}>
                                    <Icon name="send" size={14} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                </View>
            )}

            {/* Settings Modal */}
            <MediaSettings
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                user={user}
            />
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0B0B0D' },

    // ── Lobby ──────────────────────────────────────────────────────────────
    lobbyContainer: { flex: 1 },
    lobbyContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    headerContainer: { alignItems: 'center', marginBottom: 48 },
    logoText: { color: '#FFFFFF', fontSize: 34, letterSpacing: 8, fontWeight: '200' },
    waitingText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: 5, marginTop: 10, textTransform: 'uppercase' },
    diagnosticText: { color: '#D4AF37', fontSize: 12, marginTop: 10 },

    createRoomBtn: { width: 260, height: 54, borderRadius: 27, overflow: 'hidden', marginBottom: 40, shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 },
    createBtnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    createBtnText: { color: '#0B0B0D', fontWeight: '700', letterSpacing: 4, fontSize: 13 },

    roomsListContainer: { width: '100%', maxWidth: 460, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    roomsListTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
    noRoomsText: { color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontStyle: 'italic', paddingVertical: 24 },
    roomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    roomName: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
    roomCreator: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
    joinBtn: { borderRadius: 16, overflow: 'hidden' },
    joinBtnGradient: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
    joinBtnText: { color: '#D4AF37', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

    profileContainer: { position: 'absolute', top: Platform.OS === 'web' ? 24 : 50, right: 24, zIndex: 200, alignItems: 'flex-end' },
    profileAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
    profileAvatarGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    profileAvatarText: { color: '#000', fontSize: 18, fontWeight: '800' },
    profileDropdown: { marginTop: 8, width: 200, backgroundColor: '#1E1F22', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 },
    dropdownItemText: { color: '#DCDDDE', fontSize: 14 },
    dropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 3 },

    // ── In-Call layout ─────────────────────────────────────────────────────
    callLayout: { flex: 1, flexDirection: 'row' },
    mainVideoArea: { flex: 1, backgroundColor: '#111214', position: 'relative' },

    topCallBar: { position: 'absolute', top: 16, left: 16, zIndex: 50 },
    roomCodeBadge: { backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    roomCodeText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 2 },

    gridContainer: { flex: 1, padding: 16, paddingTop: 60, paddingBottom: 110 },
    gridLayout: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    gridVideoWrapper: { flex: 1, minWidth: 260, maxWidth: '50%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1E1F22' },

    focusLayout: { flex: 1, flexDirection: 'column' },
    focusedVideoWrapper: { flex: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 10, backgroundColor: '#1E1F22' },
    sidebarVideos: { height: 105, flexDirection: 'row', gap: 10 },
    sidebarVideoWrapper: { width: 180, height: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: '#1E1F22' },

    participantContainer: { flex: 1, width: '100%', height: '100%', position: 'relative', borderWidth: 2, borderColor: 'transparent', borderRadius: 12 },
    speakingBorder: { borderColor: '#5865F2' },
    participantVideo: { flex: 1, width: '100%', height: '100%' },
    avatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2B2D31' },
    avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#4E5058', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#FFF', fontSize: 32, fontWeight: '700' },

    tileOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    tileLeft: { flexDirection: 'row', gap: 6 },
    tileIndicator: { backgroundColor: 'rgba(0,0,0,0.7)', width: 26, height: 26, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
    tileIndicatorGold: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
    tileName: { backgroundColor: 'rgba(0,0,0,0.7)', color: '#DCDDDE', fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },

    reactionArea: { position: 'absolute', bottom: 50, left: '50%', alignItems: 'center' },
    reactionBubble: { position: 'absolute' },
    reactionEmoji: { fontSize: 36 },

    // ── Control Bar ────────────────────────────────────────────────────────
    controlBarWrapper: { position: 'absolute', bottom: 24, width: '100%', alignItems: 'center', zIndex: 100 },
    controlBar: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#1E1F22',
        paddingVertical: 10, paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 20,
    },
    ctrlGroup: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
    ctrlBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    ctrlBtnDanger: { backgroundColor: 'rgba(255,75,75,0.1)' },
    ctrlBtnActive: { backgroundColor: 'rgba(212,175,55,0.1)' },
    ctrlArrow: { paddingHorizontal: 6, paddingVertical: 8, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    ctrlSeparator: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 },
    ctrlBtnEndCall: {
        paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
        backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center',
    },

    chatToggleBtn: { position: 'absolute', right: 24, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1E1F22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    chatToggleBtnActive: { backgroundColor: 'rgba(212,175,55,0.1)', borderColor: 'rgba(212,175,55,0.3)' },
    unreadBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ED4245', minWidth: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
    unreadText: { color: '#FFF', fontSize: 9, fontWeight: '800' },

    // ── Device Dropdowns ───────────────────────────────────────────────────
    deviceDropdown: {
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 10,
        width: 240, backgroundColor: '#2B2D31', borderRadius: 10, padding: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
        zIndex: 999,
    },
    deviceDropdownTitle: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 6 },
    deviceDropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 6 },
    deviceOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 6 },
    deviceOptionActive: { backgroundColor: 'rgba(212,175,55,0.1)' },
    deviceOptionText: { color: '#B5BAC1', fontSize: 13, flex: 1 },
    deviceOptionTextActive: { color: '#D4AF37' },

    // ── Emoji Picker ───────────────────────────────────────────────────────
    emojiPicker: {
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 10,
        width: 290, backgroundColor: '#2B2D31', borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
        zIndex: 999,
    },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    emojiBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
    emojiBtnText: { fontSize: 22 },

    // ── Chat Panel ─────────────────────────────────────────────────────────
    chatSidePanel: { backgroundColor: '#1E1F22', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.06)' },
    chatInner: { flex: 1, width: 320 },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    chatTitle: { color: '#DCDDDE', fontSize: 15, fontWeight: '700' },
    chatMessagesArea: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
    chatMessageRow: { marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap' },
    chatSender: { color: '#D4AF37', fontWeight: '700', fontSize: 13 },
    chatText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
    noMessagesText: { color: 'rgba(255,255,255,0.2)', textAlign: 'center', fontStyle: 'italic', marginTop: 40 },
    chatInputWrapper: {
        paddingHorizontal: 14, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row', alignItems: 'center', gap: 8
    },
    chatInput: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9,
        color: '#DCDDDE', fontSize: 14,
        // Remove default browser outline
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    chatSendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#5865F2', justifyContent: 'center', alignItems: 'center' },
});
