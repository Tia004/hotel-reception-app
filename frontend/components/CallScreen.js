/**
 * CallScreen.js — v2.7.2
 * Complete redesign:
 * - Local video muted (no echo)
 * - Multi-peer connections via Map
 * - Loading animation with GSA logo
 * - Chat panel below video
 * - Device selector dropdowns (Discord-style pill buttons)
 * - Reactions, Hand Raise, Screen Share
 * - No X close button (leave via hangup only)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
    Animated, Dimensions, Platform, Image, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

const { width: W, height: H } = Dimensions.get('window');
const IS_MOBILE = W < 768;

const EMOJI_REACTIONS = ['👍', '👏', '😂', '❤️', '🎉', '🔥', '😮', '🤔'];

export default function CallScreen({ user, socket, roomId, onClose, isTempProp, onRoomState, isPiP = false, onExpand, onMinimize }) {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // socketId → MediaStream
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [handRaised, setHandRaised] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const screenStreamRef = useRef(null);

    // Chat
    const [chatVisible, setChatVisible] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatDraft, setChatDraft] = useState('');
    const chatScrollRef = useRef(null);

    // Device selectors
    const [devices, setDevices] = useState({ audio: [], video: [], speaker: [] });
    const [showMicDevices, setShowMicDevices] = useState(false);
    const [showCamDevices, setShowCamDevices] = useState(false);
    const [selectedMic, setSelectedMic] = useState('');
    const [selectedCam, setSelectedCam] = useState('');

    // Reactions
    const [showReactions, setShowReactions] = useState(false);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [remoteUsernames, setRemoteUsernames] = useState({}); // socketId → username

    // Loading
    const [loading, setLoading] = useState(true);
    const spinAnim = useRef(new Animated.Value(0)).current;

    // Peer connections map
    const pcsRef = useRef(new Map()); // socketId → RTCPeerConnection
    const localStreamRef = useRef(null);

    // ── Loading Animation ────────────────────────────────────────────────
    useEffect(() => {
        Animated.loop(
            Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
        ).start();
        const timer = setTimeout(() => setLoading(false), 1500);
        return () => clearTimeout(timer);
    }, []);

    // ── Enumerate Devices ────────────────────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const enumerate = async () => {
            try {
                const devs = await navigator.mediaDevices.enumerateDevices();
                setDevices({
                    audio: devs.filter(d => d.kind === 'audioinput'),
                    video: devs.filter(d => d.kind === 'videoinput'),
                    speaker: devs.filter(d => d.kind === 'audiooutput'),
                });
            } catch (e) { console.error('enumerate failed', e); }
        };
        enumerate();
        navigator.mediaDevices.addEventListener?.('devicechange', enumerate);
        return () => navigator.mediaDevices.removeEventListener?.('devicechange', enumerate);
    }, []);

    // ── Call Lifecycle ────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !roomId) return;
        startLocalStream();

        const onUserJoined = async ({ socketId, username }) => {
            console.log('User joined room:', username);
            setRemoteUsernames(prev => ({ ...prev, [socketId]: username }));
            const pc = createPC(socketId);
            const stream = localStreamRef.current;
            if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { target: socketId, offer, sender: socket.id });
        };

        const onOffer = async ({ sender, offer }) => {
            const pc = createPC(sender);
            const stream = localStreamRef.current;
            if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { target: sender, answer });
        };

        const onAnswer = async ({ sender, answer }) => {
            const pc = pcsRef.current.get(sender);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
        };

        const onIce = async ({ sender, candidate }) => {
            const pc = pcsRef.current.get(sender);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        };

        const onUserLeft = ({ socketId }) => {
            const pc = pcsRef.current.get(socketId);
            if (pc) { pc.close(); pcsRef.current.delete(socketId); }
            setRemoteStreams(prev => { const next = { ...prev }; delete next[socketId]; return next; });
        };

        const onChatMsg = (msg) => {
            setChatMessages(prev => [...prev, msg]);
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
        };

        const onEmojiReaction = ({ socketId, emoji }) => {
            const id = Date.now() + Math.random();
            setFloatingReactions(prev => [...prev, { id, emoji }]);
            setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
        };

        socket.on('user-joined-room', onUserJoined);
        socket.on('offer', onOffer);
        socket.on('answer', onAnswer);
        socket.on('ice-candidate', onIce);
        socket.on('user-left-room', onUserLeft);
        socket.on('chat-message', onChatMsg);
        socket.on('emoji-reaction', onEmojiReaction);

        return () => {
            socket.off('user-joined-room', onUserJoined);
            socket.off('offer', onOffer);
            socket.off('answer', onAnswer);
            socket.off('ice-candidate', onIce);
            socket.off('user-left-room', onUserLeft);
            socket.off('chat-message', onChatMsg);
            socket.off('emoji-reaction', onEmojiReaction);
            stopLocalStream();
            // Close all peer connections
            for (const pc of pcsRef.current.values()) pc.close();
            pcsRef.current.clear();
        };
    }, [socket, roomId]);

    const startLocalStream = async (audioDeviceId, videoDeviceId) => {
        try {
            const constraints = {
                audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
                video: videoDeviceId ? { deviceId: { exact: videoDeviceId }, width: 1280, height: 720 } : { width: 1280, height: 720 },
            };
            const stream = await mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
        } catch (e) { console.error('Local stream failed', e); }
    };

    const stopLocalStream = () => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
    };

    const createPC = (targetId) => {
        // Close existing connection to this peer if any
        if (pcsRef.current.has(targetId)) {
            pcsRef.current.get(targetId).close();
        }
        const pc = new RTCPeerConnection(ICE_CONFIG);
        pcsRef.current.set(targetId, pc);

        pc.ontrack = (e) => {
            if (e.streams[0]) {
                setRemoteStreams(prev => ({ ...prev, [targetId]: e.streams[0] }));
            }
        };
        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
        };
        return pc;
    };

    // ── Controls ─────────────────────────────────────────────────────────
    const toggleMic = () => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getAudioTracks()[0];
            if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
        }
    };

    const toggleCam = () => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getVideoTracks()[0];
            if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
        }
    };

    const toggleHandRaise = () => {
        const raised = !handRaised;
        setHandRaised(raised);
        socket?.emit('hand-raise', { isRaised: raised });
    };

    const toggleScreenShare = async () => {
        if (Platform.OS !== 'web') return;
        try {
            if (screenSharing) {
                // Stop sharing
                screenStreamRef.current?.getTracks().forEach(t => t.stop());
                screenStreamRef.current = null;
                setScreenSharing(false);
                // Re-add camera tracks to all peers
                const stream = localStreamRef.current;
                if (stream) {
                    for (const [peerId, pc] of pcsRef.current) {
                        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                        const videoTrack = stream.getVideoTracks()[0];
                        if (videoSender && videoTrack) videoSender.replaceTrack(videoTrack);
                    }
                }
            } else {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;
                setScreenSharing(true);
                const screenTrack = screenStream.getVideoTracks()[0];
                // Replace video track in all peer connections
                for (const [peerId, pc] of pcsRef.current) {
                    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (videoSender) videoSender.replaceTrack(screenTrack);
                }
                screenTrack.onended = () => {
                    setScreenSharing(false);
                    screenStreamRef.current = null;
                    const stream = localStreamRef.current;
                    if (stream) {
                        for (const [peerId, pc] of pcsRef.current) {
                            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                            const videoTrack = stream.getVideoTracks()[0];
                            if (videoSender && videoTrack) videoSender.replaceTrack(videoTrack);
                        }
                    }
                };
            }
        } catch (e) { console.error('Screen share failed', e); }
    };

    const sendReaction = (emoji) => {
        socket?.emit('emoji-reaction', { emoji });
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
        setShowReactions(false);
    };

    const sendChatMessage = () => {
        if (!chatDraft.trim() || !socket) return;
        const msg = { text: chatDraft.trim(), timestamp: Date.now() };
        socket.emit('chat-message', msg);
        setChatMessages(prev => [...prev, { sender: user.username, ...msg }]);
        setChatDraft('');
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const switchMicDevice = async (deviceId) => {
        setSelectedMic(deviceId);
        setShowMicDevices(false);
        const stream = await startLocalStream(deviceId, selectedCam || undefined);
        // Replace audio tracks in all peer connections
        if (stream) {
            const newTrack = stream.getAudioTracks()[0];
            for (const pc of pcsRef.current.values()) {
                const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                if (audioSender && newTrack) audioSender.replaceTrack(newTrack);
            }
        }
    };

    const switchCamDevice = async (deviceId) => {
        setSelectedCam(deviceId);
        setShowCamDevices(false);
        const stream = await startLocalStream(selectedMic || undefined, deviceId);
        if (stream) {
            const newTrack = stream.getVideoTracks()[0];
            for (const pc of pcsRef.current.values()) {
                const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender && newTrack) videoSender.replaceTrack(newTrack);
            }
        }
    };

    const hangUp = () => {
        socket?.emit('leave-room');
        onClose();
    };

    const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const remoteEntries = Object.entries(remoteStreams);

    // ── Loading Screen ───────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={styles.root}>
                <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />
                <View style={styles.loadingCenter}>
                    <Image source={require('../assets/logo.png')} style={styles.loadingLogo} resizeMode="contain" />
                    <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
                        <View style={styles.spinnerArc} />
                    </Animated.View>
                    <Text style={styles.loadingText}>Connessione alla stanza...</Text>
                </View>
            </View>
        );
    }

    // ── PiP Compact Render ────────────────────────────────────────────────
    if (isPiP) {
        return (
            <View style={styles.pipRoot}>
                <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />
                {/* Video: show remote if available, otherwise local */}
                <View style={styles.pipVideoArea}>
                    {remoteEntries.length > 0 ? (
                        <RTCView
                            streamURL={remoteEntries[0][1].toURL ? remoteEntries[0][1].toURL() : remoteEntries[0][1]}
                            style={styles.rtc}
                            objectFit="cover"
                        />
                    ) : camOn && localStream ? (
                        <RTCView
                            streamURL={localStream.toURL ? localStream.toURL() : localStream}
                            style={styles.rtc}
                            objectFit="cover"
                            muted={true}
                            mirror={true}
                        />
                    ) : (
                        <View style={styles.avatarTile}>
                            <Text style={styles.avatarTxt}>{(user.username || '?')[0].toUpperCase()}</Text>
                        </View>
                    )}
                </View>
                {/* Compact Controls */}
                <View style={styles.pipControls}>
                    <TouchableOpacity style={[styles.pipCtrl, !micOn && { backgroundColor: '#ED4245' }]} onPress={toggleMic}>
                        <Icon name={micOn ? 'mic-filled' : 'mic-off-filled'} size={14} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pipCtrl, !camOn && { backgroundColor: '#ED4245' }]} onPress={toggleCam}>
                        <Icon name={camOn ? 'video-filled' : 'video-off-filled'} size={14} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pipCtrl, { backgroundColor: '#ED4245' }]} onPress={hangUp}>
                        <Icon name="phone" size={14} color="#fff" />
                    </TouchableOpacity>
                    {onExpand && (
                        <TouchableOpacity style={styles.pipCtrl} onPress={onExpand}>
                            <Icon name="maximize-2" size={14} color="#C9A84C" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />

            {/* Floating Reactions */}
            {floatingReactions.map(r => (
                <Animated.Text key={r.id} style={styles.floatingEmoji}>{r.emoji}</Animated.Text>
            ))}

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.roomBadge}>
                    <Icon name="video-filled" size={14} color="#C9A84C" />
                    <Text style={styles.roomName}>STANZA #{roomId}</Text>
                    {isTempProp && <View style={styles.tempBadge}><Text style={styles.tempTxt}>TEMP</Text></View>}
                </View>
                <View style={{ flex: 1 }} />
                {handRaised && (
                    <View style={styles.handIndicator}>
                        <Text style={{ fontSize: 16 }}>✋</Text>
                    </View>
                )}
                {onMinimize && (
                    <TouchableOpacity onPress={onMinimize} style={{ padding: 6 }}>
                        <Icon name="minimize-2" size={18} color="#C9A84C" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Main content: video + optional chat */}
            <View style={styles.mainContent}>
                {/* Video Grid */}
                <View style={styles.videoArea}>
                    <View style={styles.videoGrid}>
                        {/* Local video */}
                        <View style={[styles.tile, remoteEntries.length > 0 ? styles.tileSide : styles.tileCenter]}>
                            {camOn && localStream ? (
                                <RTCView
                                    streamURL={localStream.toURL ? localStream.toURL() : localStream}
                                    style={styles.rtc}
                                    objectFit="cover"
                                    muted={true}
                                    mirror={true}
                                />
                            ) : (
                                <View style={styles.avatarTile}>
                                    <Text style={styles.avatarTxt}>{(user.username || '?')[0].toUpperCase()}</Text>
                                </View>
                            )}
                            <View style={styles.nameOverlay}>
                                <Text style={styles.nameTxt}>Tu {!micOn && '🔇'}</Text>
                            </View>
                        </View>

                        {/* Remote videos */}
                        {remoteEntries.map(([sid, stream]) => (
                            <View key={sid} style={[styles.tile, styles.tileSide]}>
                                <RTCView
                                    streamURL={stream.toURL ? stream.toURL() : stream}
                                    style={styles.rtc}
                                    objectFit="cover"
                                />
                                <View style={styles.nameOverlay}>
                                    <Text style={styles.nameTxt}>{remoteUsernames[sid] || 'Partecipante'}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Controls */}
                    <View style={styles.controls}>
                        {/* Mic with device selector */}
                        <View style={{ position: 'relative' }}>
                            <View style={[styles.ctrlPill, !micOn && styles.ctrlPillOff]}>
                                <TouchableOpacity style={styles.ctrlPillMain} onPress={toggleMic}>
                                    <Icon name={micOn ? 'mic-filled' : 'mic-off-filled'} size={20} color={micOn ? '#C8C4B8' : '#ED4245'} />
                                </TouchableOpacity>
                                <View style={styles.ctrlDivider} />
                                <TouchableOpacity style={styles.ctrlPillArrow} onPress={() => { setShowMicDevices(!showMicDevices); setShowCamDevices(false); }}>
                                    <Icon name="arrow-down" size={12} color={micOn ? '#C8C4B8' : '#ED4245'} />
                                </TouchableOpacity>
                            </View>
                            {showMicDevices && (
                                <View style={styles.deviceDropdown}>
                                    <Text style={styles.deviceDropdownTitle}>MICROFONO</Text>
                                    {devices.audio.map((d, i) => (
                                        <TouchableOpacity key={i} style={[styles.deviceOpt, selectedMic === d.deviceId && styles.deviceOptActive]}
                                            onPress={() => switchMicDevice(d.deviceId)}>
                                            <Text style={styles.deviceOptTxt}>{d.label || `Microfono ${i + 1}`}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Camera with device selector */}
                        <View style={{ position: 'relative' }}>
                            <View style={[styles.ctrlPill, !camOn && styles.ctrlPillOff]}>
                                <TouchableOpacity style={styles.ctrlPillMain} onPress={toggleCam}>
                                    <Icon name={camOn ? 'video-filled' : 'video-off-filled'} size={20} color={camOn ? '#C8C4B8' : '#ED4245'} />
                                </TouchableOpacity>
                                <View style={styles.ctrlDivider} />
                                <TouchableOpacity style={styles.ctrlPillArrow} onPress={() => { setShowCamDevices(!showCamDevices); setShowMicDevices(false); }}>
                                    <Icon name="arrow-down" size={12} color={camOn ? '#C8C4B8' : '#ED4245'} />
                                </TouchableOpacity>
                            </View>
                            {showCamDevices && (
                                <View style={styles.deviceDropdown}>
                                    <Text style={styles.deviceDropdownTitle}>VIDEOCAMERA</Text>
                                    {devices.video.map((d, i) => (
                                        <TouchableOpacity key={i} style={[styles.deviceOpt, selectedCam === d.deviceId && styles.deviceOptActive]}
                                            onPress={() => switchCamDevice(d.deviceId)}>
                                            <Text style={styles.deviceOptTxt}>{d.label || `Camera ${i + 1}`}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Screen Share */}
                        <TouchableOpacity style={[styles.ctrlBtn, screenSharing && styles.ctrlBtnActive]} onPress={toggleScreenShare}>
                            <Icon name="screen-share" size={20} color={screenSharing ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>

                        {/* Reactions */}
                        <View style={{ position: 'relative' }}>
                            <TouchableOpacity style={[styles.ctrlBtn, showReactions && styles.ctrlBtnActive]} onPress={() => setShowReactions(!showReactions)}>
                                <Icon name="happy" size={20} color={showReactions ? '#C9A84C' : '#C8C4B8'} />
                            </TouchableOpacity>
                            {showReactions && (
                                <View style={styles.reactionPicker}>
                                    {EMOJI_REACTIONS.map((e, i) => (
                                        <TouchableOpacity key={i} style={styles.reactionBtn} onPress={() => sendReaction(e)}>
                                            <Text style={{ fontSize: 20 }}>{e}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Hand Raise */}
                        <TouchableOpacity style={[styles.ctrlBtn, handRaised && styles.ctrlBtnActive]} onPress={toggleHandRaise}>
                            <Icon name={handRaised ? 'hand-raised' : 'hand'} size={20} color={handRaised ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>

                        {/* Chat toggle */}
                        <TouchableOpacity style={[styles.ctrlBtn, chatVisible && styles.ctrlBtnActive]} onPress={() => setChatVisible(!chatVisible)}>
                            <Icon name="message-square" size={20} color={chatVisible ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>

                        {/* Hang up */}
                        <TouchableOpacity style={styles.hangupBtn} onPress={hangUp}>
                            <Icon name="phone-off" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Chat Panel (below or side) */}
                {chatVisible && (
                    <View style={styles.chatPanel}>
                        <View style={styles.chatHeader}>
                            <Text style={styles.chatTitle}>CHAT STANZA</Text>
                            <TouchableOpacity onPress={() => setChatVisible(false)}>
                                <Icon name="x" size={14} color="#554E40" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView ref={chatScrollRef} style={styles.chatScroll}>
                            <Text style={styles.chatInfo}>La chat della stanza è temporanea e non viene salvata.</Text>
                            {chatMessages.map((msg, i) => {
                                const mine = msg.sender === user.username;
                                return (
                                    <View key={i} style={[styles.chatMsg, mine && styles.chatMsgMine]}>
                                        {!mine && <Text style={styles.chatMsgSender}>{msg.sender}</Text>}
                                        <Text style={styles.chatMsgText}>{msg.text}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <View style={styles.chatInputRow}>
                            <TextInput
                                style={styles.chatInput}
                                placeholder="Scrivi un messaggio..."
                                placeholderTextColor="#554E40"
                                value={chatDraft}
                                onChangeText={setChatDraft}
                                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                onKeyPress={(e) => {
                                    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                                        e.preventDefault();
                                        sendChatMessage();
                                    }
                                }}
                            />
                            <TouchableOpacity style={styles.chatSendBtn} onPress={sendChatMessage}>
                                <Icon name="send" size={14} color="#111" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, position: 'relative' },

    // Loading
    loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
    loadingLogo: { width: 80, height: 80 },
    spinner: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: 'transparent', borderTopColor: '#C9A84C', borderRightColor: 'rgba(201,168,76,0.3)' },
    spinnerArc: {},
    loadingText: { color: '#554E40', fontSize: 14, fontWeight: '600', letterSpacing: 1 },

    // Header
    header: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    roomName: { color: '#C8C4B8', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    tempBadge: { backgroundColor: '#FF8C00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tempTxt: { color: '#000', fontSize: 9, fontWeight: '900' },
    handIndicator: { backgroundColor: 'rgba(201,168,76,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },

    // Main layout
    mainContent: { flex: 1, flexDirection: 'column' },
    videoArea: { flex: 1, justifyContent: 'center' },
    videoGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16 },
    tile: { backgroundColor: '#0A0908', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)', position: 'relative', elevation: 10 },
    tileCenter: { width: '70%', aspectRatio: 16 / 9, maxWidth: 800 },
    tileSide: { width: '45%', aspectRatio: 16 / 9, maxWidth: 600 },
    rtc: { flex: 1 },
    avatarTile: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1812' },
    avatarTxt: { color: '#C9A84C', fontSize: 44, fontWeight: '800' },
    nameOverlay: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
    nameTxt: { color: '#C8C4B8', fontSize: 11, fontWeight: '600' },

    // Controls
    controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 12, paddingBottom: 8, flexWrap: 'wrap' },

    // Discord-style pill buttons for mic/cam
    ctrlPill: {
        flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22,
        backgroundColor: '#1C1A12', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)', overflow: 'hidden',
    },
    ctrlPillOff: { backgroundColor: 'rgba(237,66,69,0.1)', borderColor: '#ED4245' },
    ctrlPillMain: { paddingHorizontal: 14, height: '100%', justifyContent: 'center', alignItems: 'center' },
    ctrlDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.08)' },
    ctrlPillArrow: { paddingHorizontal: 8, height: '100%', justifyContent: 'center', alignItems: 'center' },

    // Simple round button
    ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    ctrlBtnActive: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: '#C9A84C' },
    hangupBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center', shadowColor: '#ED4245', shadowOpacity: 0.4, shadowRadius: 10 },

    // Device dropdown
    deviceDropdown: {
        position: 'absolute', bottom: 54, left: 0, minWidth: 220,
        backgroundColor: '#16140F', borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.2)', padding: 8, zIndex: 200,
        shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20,
    },
    deviceDropdownTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4 },
    deviceOpt: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
    deviceOptActive: { backgroundColor: 'rgba(201,168,76,0.1)' },
    deviceOptTxt: { color: '#C8C4B8', fontSize: 12, fontWeight: '500' },

    // Reaction picker
    reactionPicker: {
        position: 'absolute', bottom: 54, left: -80,
        flexDirection: 'row', flexWrap: 'wrap', gap: 4,
        backgroundColor: '#16140F', borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.2)', padding: 8, width: 200, zIndex: 200,
    },
    reactionBtn: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },

    // Floating reactions
    floatingEmoji: { position: 'absolute', bottom: 100, right: 20, fontSize: 32, zIndex: 1000 },

    // Chat panel
    chatPanel: {
        height: 250, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.08)',
        backgroundColor: 'rgba(14,13,12,0.95)',
    },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.05)' },
    chatTitle: { color: '#554E40', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
    chatScroll: { flex: 1, padding: 10 },
    chatInfo: { color: '#3A3630', fontSize: 11, textAlign: 'center', marginBottom: 8 },
    chatMsg: { marginBottom: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, alignSelf: 'flex-start', maxWidth: '80%' },
    chatMsgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(201,168,76,0.1)' },
    chatMsgSender: { color: '#C9A84C', fontSize: 10, fontWeight: '700', marginBottom: 2 },
    chatMsgText: { color: '#C8C4B8', fontSize: 13 },
    chatInputRow: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.05)' },
    chatInput: { flex: 1, backgroundColor: '#1A1812', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#C8C4B8', fontSize: 13, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    chatSendBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },

    // PiP mode
    pipRoot: { flex: 1, borderRadius: 14, overflow: 'hidden' },
    pipVideoArea: { flex: 1 },
    pipControls: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 8, backgroundColor: 'rgba(14,13,12,0.95)',
    },
    pipCtrl: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
    },
});
