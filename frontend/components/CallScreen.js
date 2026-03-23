import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
    Animated, Dimensions, Platform, Image, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import ReactDOM from 'react-dom';

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

const { width: W, height: H } = Dimensions.get('window');
const IS_MOBILE = W < 768;

const EMOJI_REACTIONS = ['👍', '👏', '😂', '❤️', '🎉', '🔥', '😮', '🤔'];

const FloatingEmoji = ({ emoji, onComplete }) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const translateX = useRef(new Animated.Value((Math.random() - 0.5) * 60)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: -300, duration: 2500, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 2500, useNativeDriver: true, delay: 1500 }),
        ]).start(() => { if (onComplete) onComplete(); });
    }, []);

    return (
        <Animated.Text style={[styles.floatingEmoji, { transform: [{ translateY }, { translateX }], opacity }]}>
            {emoji}
        </Animated.Text>
    );
};



export default function CallScreen({ user, socket, roomId, onClose, isTempProp, onRoomState, isPiP = false, onExpand, onMinimize }) {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // socketId → MediaStream
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [deafenOn, setDeafenOn] = useState(false); // Discord-style deafen
    const [handRaised, setHandRaised] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const screenStreamRef = useRef(null);
    const [remoteStates, setRemoteStates] = useState({}); // socketId → { micOn, camOn, deafenOn }

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
    const [hideNoVideo, setHideNoVideo] = useState(false);

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
    const pipVideoRef = useRef(null); // hidden video element for Browser PiP
    
    // Document PiP
    const [docPipWindow, setDocPipWindow] = useState(null);

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

        // Message to request in-call chat history
        socket.emit('room-chat-history', { roomId });
        socket.on('room-chat-history', ({ messages: hist }) => {
            if (hist && hist.length) setChatMessages(hist);
        });

        const onChatMsg = (msg) => {
            setChatMessages(prev => [...prev, msg]);
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
        };
        const onEmojiReaction = ({ socketId, emoji }) => {
            const id = Date.now() + Math.random();
            setFloatingReactions(prev => [...prev, { id, emoji }]);
            setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
        };

        const onMediaState = ({ socketId, ...state }) => {
            setRemoteStates(prev => ({ ...prev, [socketId]: { ...prev[socketId], ...state } }));
        };

        socket.on('user-joined-room', onUserJoined);
        socket.on('offer', onOffer);
        socket.on('answer', onAnswer);
        socket.on('ice-candidate', onIce);
        socket.on('user-left-room', onUserLeft);
        socket.on('chat-message', onChatMsg);
        socket.on('emoji-reaction', onEmojiReaction);
        socket.on('media-state-change', onMediaState);

        // Sync initial state
        socket.emit('media-state-change', { micOn, camOn, deafenOn });

        return () => {
            socket.off('user-joined-room', onUserJoined);
            socket.off('offer', onOffer);
            socket.off('answer', onAnswer);
            socket.off('ice-candidate', onIce);
            socket.off('user-left-room', onUserLeft);
            socket.off('chat-message', onChatMsg);
            socket.off('emoji-reaction', onEmojiReaction);
            socket.off('media-state-change', onMediaState);
            socket.off('room-chat-history');
            stopLocalStream();
            for (const pc of pcsRef.current.values()) pc.close();
            pcsRef.current.clear();
        };
    }, [socket, roomId]);

    // ── Browser Picture-in-Picture logic ─────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        if (!isPiP && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
        }

        if (isPiP) return;

        const videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
        document.body.appendChild(videoEl);
        pipVideoRef.current = videoEl;

        const onVisibilityChange = async () => {
            if (!('pictureInPictureEnabled' in document)) return;
            try {
                if (document.hidden) {
                    const remoteKeys = Object.keys(remoteStreams);
                    const stream = remoteKeys.length > 0 ? remoteStreams[remoteKeys[0]] : localStreamRef.current;
                    if (stream) {
                        videoEl.srcObject = stream;
                        await videoEl.play();
                        await videoEl.requestPictureInPicture();
                    }
                }
            } catch (e) { console.warn('PiP auto-trigger failed', e); }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
        };
    }, [remoteStreams, isPiP]);

    const startLocalStream = async (audioDeviceId, videoDeviceId) => {
        try {
            const constraints = {
                audio: audioDeviceId ? { deviceId: { ideal: audioDeviceId } } : true,
                video: videoDeviceId ? { deviceId: { ideal: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
            };
            const stream = await mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);
            socket.emit('media-state-change', { micOn, camOn, deafenOn });
            return stream;
        } catch (e) { 
            console.error('Local stream failed', e);
            try {
                const fallback = await mediaDevices.getUserMedia({ audio: true, video: false });
                localStreamRef.current = fallback;
                setLocalStream(fallback);
                setCamOn(false);
                return fallback;
            } catch (e2) {}
        }
    };

    const stopLocalStream = () => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
    };

    const createPC = (targetId) => {
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
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { target: targetId, offer, sender: socket.id });
            } catch (err) {
                console.error(err);
            }
        };
        return pc;
    };

    const toggleMic = () => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getAudioTracks()[0];
            if (t) { 
                t.enabled = !t.enabled; 
                setMicOn(t.enabled);
                socket.emit('media-state-change', { micOn: t.enabled });
            }
        }
    };

    const toggleCam = () => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getVideoTracks()[0];
            if (t) { 
                t.enabled = !t.enabled; 
                setCamOn(t.enabled);
                socket.emit('media-state-change', { camOn: t.enabled });
            }
        }
    };

    const toggleDeafen = () => {
        const next = !deafenOn;
        setDeafenOn(next);
        if (next) setMicOn(false); 
        socket.emit('media-state-change', { deafenOn: next, micOn: !next && micOn });
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
                screenStreamRef.current?.getTracks().forEach(t => t.stop());
                screenStreamRef.current = null;
                setScreenSharing(false);
                const stream = localStreamRef.current;
                if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    for (const pc of pcsRef.current.values()) {
                        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                        if (videoSender && videoTrack) {
                            videoSender.replaceTrack(videoTrack);
                        } else if (videoTrack) {
                            pc.addTrack(videoTrack, stream);
                        }
                    }
                }
            } else {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;
                setScreenSharing(true);
                const screenTrack = screenStream.getVideoTracks()[0];
                for (const pc of pcsRef.current.values()) {
                    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack);
                    } else {
                        pc.addTrack(screenTrack, screenStream);
                    }
                }
                screenTrack.onended = () => {
                    setScreenSharing(false);
                    screenStreamRef.current = null;
                    const stream = localStreamRef.current;
                    if (stream) {
                        const videoTrack = stream.getVideoTracks()[0];
                        for (const pc of pcsRef.current.values()) {
                            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                            if (videoSender && videoTrack) {
                                videoSender.replaceTrack(videoTrack);
                            } else if (videoTrack) {
                                pc.addTrack(videoTrack, stream);
                            }
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
        const msg = { text: chatDraft.trim(), timestamp: Date.now(), sender: user.username };
        socket.emit('chat-message', msg);
        socket.emit('room-chat-save', { roomId, message: msg });
        setChatMessages(prev => [...prev, { ...msg }]);
        setChatDraft('');
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const switchMicDevice = async (deviceId) => {
        setSelectedMic(deviceId);
        setShowMicDevices(false);
        try {
            const stream = await mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
            const newTrack = stream.getAudioTracks()[0];
            if (newTrack) {
                newTrack.enabled = micOn && !deafenOn;
                const oldTrack = localStreamRef.current?.getAudioTracks()[0];
                if (oldTrack) {
                    oldTrack.stop();
                    localStreamRef.current.removeTrack(oldTrack);
                }
                if (!localStreamRef.current) localStreamRef.current = new MediaStream();
                localStreamRef.current.addTrack(newTrack);
                setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
                for (const pc of pcsRef.current.values()) {
                    const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (audioSender) audioSender.replaceTrack(newTrack);
                }
            }
        } catch (e) { console.error('Failed to switch mic', e); }
    };

    const switchCamDevice = async (deviceId) => {
        setSelectedCam(deviceId);
        setShowCamDevices(false);
        try {
            const stream = await mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } });
            const newTrack = stream.getVideoTracks()[0];
            if (newTrack) {
                newTrack.enabled = camOn;
                const oldTrack = localStreamRef.current?.getVideoTracks()[0];
                if (oldTrack) {
                    oldTrack.stop();
                    localStreamRef.current.removeTrack(oldTrack);
                }
                if (!localStreamRef.current) localStreamRef.current = new MediaStream();
                localStreamRef.current.addTrack(newTrack);
                setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
                for (const pc of pcsRef.current.values()) {
                    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (videoSender) videoSender.replaceTrack(newTrack);
                }
            }
        } catch (e) { console.error('Failed to switch cam', e); }
    };

    const hangUp = async () => {
        if (Platform.OS === 'web' && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
        }
        if (docPipWindow) {
            docPipWindow.close();
            setDocPipWindow(null);
        }
        try {
            const audio = new window.Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {}
        socket?.emit('leave-room');
        onClose();
    };

    const toggleDocPiP = async () => {
        if (Platform.OS !== 'web' || !('documentPictureInPicture' in window)) {
            alert('Document Picture-in-Picture non supportato in questo browser.');
            return;
        }
        if (docPipWindow) {
            docPipWindow.close();
            return;
        }
        try {
            const pip = await window.documentPictureInPicture.requestWindow({ width: 1000, height: 700 });
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pip.document.head.appendChild(style);
                } catch (e) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.type = styleSheet.type;
                    link.media = styleSheet.media;
                    link.href = styleSheet.href;
                    pip.document.head.appendChild(link);
                }
            });
            const rootId = 'doc-pip-root';
            const pipRoot = document.createElement('div');
            pipRoot.id = rootId;
            pipRoot.style.height = '100%';
            pipRoot.style.width = '100%';
            pipRoot.style.backgroundColor = '#0C0B09';
            pip.document.body.appendChild(pipRoot);
            
            pip.addEventListener('pagehide', () => setDocPipWindow(null));
            setDocPipWindow(pip);
        } catch (e) {
            console.error('Doc PiP failed:', e);
        }
    };

    const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const remoteEntries = Object.entries(remoteStreams);

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

    if (isPiP) {
        return (
            <View style={styles.pipRoot}>
                <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />
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

    const callContent = (
        <View style={styles.root}>
            <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />

            <View pointerEvents="none" style={styles.floatingEmojiContainer}>
                {floatingReactions.map(r => (
                    <FloatingEmoji key={r.id} emoji={r.emoji} />
                ))}
            </View>

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
                    <TouchableOpacity onPress={onMinimize} style={styles.minimizeBtn}>
                        <Icon name={IS_MOBILE ? 'message-square' : 'minimize-2'} size={IS_MOBILE ? 16 : 18} color="#C9A84C" />
                        {IS_MOBILE && <Text style={{ color: '#C9A84C', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Chat</Text>}
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.mainContent}>
                <View style={styles.videoArea}>
                    <ScrollView 
                        contentContainerStyle={[styles.videoGrid, (remoteEntries.length === 1 && !screenSharing && (!hideNoVideo || remoteStates[remoteEntries[0][0]]?.camOn)) ? { padding: 0, flex: 1 } : {}]} 
                        scrollEnabled={!IS_MOBILE}
                    >
                        {(() => {
                            const visibleEntries = hideNoVideo ? remoteEntries.filter(([sid]) => remoteStates[sid]?.camOn) : remoteEntries;
                            const is1v1 = visibleEntries.length === 1 && !screenSharing;

                            const localTile = (
                                <View style={[styles.tile, is1v1 ? styles.tilePiP : (visibleEntries.length === 0 ? styles.tileLarge : styles.tileMedium)]}>
                                    {screenSharing ? (
                                        <View style={{ flex: 1, backgroundColor: '#141210', justifyContent: 'center', alignItems: 'center', borderRadius: 16 }}>
                                            <Icon name="screen-share" size={28} color="#C9A84C" />
                                            <Text style={{ color: '#E8E4D8', fontSize: 13, marginTop: 8, fontWeight: '600' }}>Schermo Condiviso</Text>
                                        </View>
                                    ) : camOn && localStream ? (
                                        <RTCView streamURL={localStream.toURL ? localStream.toURL() : localStream} style={styles.rtc} objectFit="cover" muted={true} mirror={true} />
                                    ) : (
                                        <View style={styles.avatarTile}>
                                            <View style={is1v1 ? styles.avatarCircleSmall : styles.avatarCircleLarge}>
                                                <Text style={is1v1 ? styles.avatarTxtSmall : styles.avatarTxtLarge}>{(user.username || '?')[0].toUpperCase()}</Text>
                                            </View>
                                        </View>
                                    )}
                                    <View style={styles.participantOverlay}>
                                        <Text style={styles.participantName}>Tu</Text>
                                        <View style={styles.participantIcons}>
                                            {!micOn && (
                                                <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                    <Icon name="mic-filled" size={10} color="#FFF" />
                                                    <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                </View>
                                            )}
                                            {deafenOn && (
                                                <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                    <Icon name="speaker" size={10} color="#FFF" />
                                                    <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            );

                            if (is1v1) {
                                const [sid, stream] = visibleEntries[0];
                                const rState = remoteStates[sid] || { micOn: true, camOn: true, deafenOn: false };
                                return (
                                    <View style={styles.discord1v1Root}>
                                        <View key={sid} style={[styles.tile, styles.tileFullscreen]}>
                                            {rState.camOn ? (
                                                <RTCView streamURL={stream.toURL ? stream.toURL() : stream} style={styles.rtc} objectFit="cover" muted={deafenOn} />
                                            ) : (
                                                <View style={styles.avatarTile}>
                                                    <View style={styles.avatarCircleHuge}>
                                                        <Text style={styles.avatarTxtHuge}>{remoteUsernames[sid]?.[0]?.toUpperCase() || '?'}</Text>
                                                    </View>
                                                </View>
                                            )}
                                            <View style={styles.participantOverlay}>
                                                <Text style={styles.participantName}>{remoteUsernames[sid] || 'Partecipante'}</Text>
                                                <View style={styles.participantIcons}>
                                                    {!rState.micOn && (
                                                        <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                            <Icon name="mic-filled" size={10} color="#FFF" />
                                                            <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                        </View>
                                                    )}
                                                    {rState.deafenOn && (
                                                        <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                            <Icon name="speaker" size={10} color="#FFF" />
                                                            <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                        <View style={styles.localPipOverlay}>
                                            {localTile}
                                        </View>
                                    </View>
                                );
                            }

                            return (
                                <>
                                    {localTile}
                                    {visibleEntries.map(([sid, stream]) => {
                                        const rState = remoteStates[sid] || { micOn: true, camOn: true, deafenOn: false };
                                        return (
                                            <View key={sid} style={[styles.tile, styles.tileMedium]}>
                                                {rState.camOn ? (
                                                    <RTCView streamURL={stream.toURL ? stream.toURL() : stream} style={styles.rtc} objectFit="cover" muted={deafenOn} />
                                                ) : (
                                                    <View style={styles.avatarTile}>
                                                        <View style={styles.avatarCircleLarge}>
                                                            <Text style={styles.avatarTxtLarge}>{remoteUsernames[sid]?.[0]?.toUpperCase() || '?'}</Text>
                                                        </View>
                                                    </View>
                                                )}
                                                <View style={styles.participantOverlay}>
                                                    <Text style={styles.participantName}>{remoteUsernames[sid] || 'Partecipante'}</Text>
                                                    <View style={styles.participantIcons}>
                                                        {!rState.micOn && (
                                                            <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                                <Icon name="mic-filled" size={10} color="#FFF" />
                                                                <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                            </View>
                                                        )}
                                                        {rState.deafenOn && (
                                                            <View style={{ position: 'relative', width: 14, height: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ED4245', borderRadius: 7 }}>
                                                                <Icon name="speaker" size={10} color="#FFF" />
                                                                <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#1A1812', transform: [{ rotate: '45deg' }] }} />
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })}
                                    {screenSharing && Platform.OS === 'web' && (
                                        <View style={[styles.tile, styles.tileFull]}>
                                            <ScreenSharePlaceholder toggle={toggleScreenShare} />
                                        </View>
                                    )}
                                </>
                            );
                        })()}
                    </ScrollView>

                    <View style={styles.controls}>
                        <View style={styles.controlGroup}>
                            <View style={styles.devicesWrapper}>
                                <View style={[styles.ctrlPill, !micOn && styles.ctrlPillOff]}>
                                    <TouchableOpacity style={styles.ctrlPillMain} onPress={toggleMic}>
                                        <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
                                            <Icon name="mic-filled" size={20} color={micOn ? '#C8C4B8' : '#ED4245'} />
                                            {!micOn && <View style={{ position: 'absolute', width: 24, height: 3, backgroundColor: '#141210', transform: [{ rotate: '45deg' }] }} />}
                                            {!micOn && <View style={{ position: 'absolute', width: 22, height: 1.5, backgroundColor: '#ED4245', transform: [{ rotate: '45deg' }] }} />}
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.ctrlDivider} />
                                    <TouchableOpacity style={styles.ctrlPillArrow} onPress={() => { setShowMicDevices(!showMicDevices); setShowCamDevices(false); }}>
                                        <Icon name="arrow-down" size={10} color={micOn ? '#C8C4B8' : '#ED4245'} />
                                    </TouchableOpacity>
                                </View>
                                {showMicDevices && devices.audio && devices.audio.length > 0 && (
                                    <View style={styles.deviceMenu}>
                                        {devices.audio.map(d => (
                                            <TouchableOpacity key={d.deviceId} style={styles.deviceItem} onPress={() => switchMicDevice(d.deviceId)}>
                                                <Text style={[styles.deviceTxt, selectedMic === d.deviceId && { color: '#C9A84C' }]} numberOfLines={1}>{d.label || 'Microfono'}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <TouchableOpacity style={[styles.ctrlBtn, deafenOn && styles.ctrlBtnOff]} onPress={toggleDeafen}>
                                <Icon name={deafenOn ? 'speaker-off' : 'speaker'} size={20} color={deafenOn ? '#ED4245' : '#C8C4B8'} />
                            </TouchableOpacity>

                            <View style={styles.devicesWrapper}>
                                <View style={[styles.ctrlPill, !camOn && styles.ctrlPillOff]}>
                                    <TouchableOpacity style={styles.ctrlPillMain} onPress={toggleCam}>
                                        <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
                                            <Icon name="video-filled" size={20} color={camOn ? '#C8C4B8' : '#ED4245'} />
                                            {!camOn && <View style={{ position: 'absolute', width: 24, height: 3, backgroundColor: '#141210', transform: [{ rotate: '45deg' }] }} />}
                                            {!camOn && <View style={{ position: 'absolute', width: 22, height: 1.5, backgroundColor: '#ED4245', transform: [{ rotate: '45deg' }] }} />}
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.ctrlDivider} />
                                    <TouchableOpacity style={styles.ctrlPillArrow} onPress={() => { setShowCamDevices(!showCamDevices); setShowMicDevices(false); }}>
                                    <Icon name="arrow-down" size={10} color={camOn ? '#C8C4B8' : '#ED4245'} />
                                </TouchableOpacity>
                            </View>
                            {showCamDevices && devices.video && devices.video.length > 0 && (
                                <View style={styles.deviceMenu}>
                                    {devices.video.map(d => (
                                        <TouchableOpacity key={d.deviceId} style={styles.deviceItem} onPress={() => switchCamDevice(d.deviceId)}>
                                            <Text style={[styles.deviceTxt, selectedCam === d.deviceId && { color: '#C9A84C' }]} numberOfLines={1}>{d.label || 'Fotocamera'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={styles.controlGroup}>
                        <TouchableOpacity style={[styles.ctrlBtn, screenSharing && styles.ctrlBtnActive]} onPress={toggleScreenShare}>
                            <Icon name="screen-share" size={20} color={screenSharing ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.ctrlBtn, showReactions && styles.ctrlBtnActive]} onPress={() => setShowReactions(!showReactions)}>
                            <Icon name="happy" size={20} color={showReactions ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ctrlBtn} onPress={toggleHandRaise}>
                            <Icon name={handRaised ? 'hand-raised' : 'hand'} size={20} color={handRaised ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.ctrlBtn, chatVisible && styles.ctrlBtnActive]} onPress={() => setChatVisible(!chatVisible)}>
                            <Icon name="message-square" size={20} color={chatVisible ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.ctrlBtn, hideNoVideo && styles.ctrlBtnActive]} onPress={() => setHideNoVideo(!hideNoVideo)}>
                            <Icon name="eye-off" size={20} color={hideNoVideo ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        {Platform.OS === 'web' && 'documentPictureInPicture' in window && (
                            <TouchableOpacity style={[styles.ctrlBtn, docPipWindow && styles.ctrlBtnActive]} onPress={toggleDocPiP}>
                                <Icon name="external-link" size={20} color={docPipWindow ? '#C9A84C' : '#C8C4B8'} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity style={styles.hangupBtn} onPress={hangUp}>
                        <Icon name="phone-off" size={22} color="#FFF" />
                    </TouchableOpacity>
                </View>
                </View>

                {showReactions && (
                    <View style={styles.reactionsPopup}>
                        {['👍', '❤️', '😂', '🔥', '👏', '🎉'].map(emoji => (
                            <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => {
                                socket.emit('emoji-reaction', { roomId, emoji });
                                const id = Date.now() + Math.random();
                                setFloatingReactions(prev => [...prev, { id, emoji }]);
                                setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
                                setShowReactions(false);
                            }}>
                                <Text style={styles.reactionTxt}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

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

    if (docPipWindow) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>Call extracted to Pop Out (PiP)</Text>
                {ReactDOM.createPortal(callContent, docPipWindow.document.getElementById('doc-pip-root'))}
            </View>
        );
    }
    
    return callContent;
}

const ScreenSharePlaceholder = ({ toggle }) => (
    <View style={styles.screenSharePatina}>
        <View style={styles.screenShareCenterBox}>
            <View style={styles.screenShareIconCircle}>
                <Icon name="screen-share" size={32} color="#C9A84C" />
            </View>
            <Text style={styles.screenShareMainTxt}>Stai condividendo lo schermo</Text>
            <Text style={styles.screenShareSubTxt}>I partecipanti vedono il tuo schermo in tempo reale</Text>
            <TouchableOpacity style={styles.screenShareCentralBtn} onPress={toggle}>
                <Icon name="stop-circle" size={18} color="#fff" />
                <Text style={styles.screenShareStopTxt}>Interrompi condivisione</Text>
            </TouchableOpacity>
        </View>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, position: 'relative', backgroundColor: '#0C0B09' },
    floatingEmojiContainer: { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 100 },
    floatingEmoji: { fontSize: 48, position: 'absolute', bottom: 0 },
    reactionsPopup: { position: 'absolute', bottom: 90, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#2B2D31', padding: 12, borderRadius: 30, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 10, zIndex: 1000 },
    reactionBtn: { padding: 8, backgroundColor: '#1C1A16', borderRadius: 20 },
    reactionTxt: { fontSize: 24 },
    loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
    loadingLogo: { width: 80, height: 80 },
    spinner: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: 'transparent', borderTopColor: '#C9A84C', borderRightColor: 'rgba(201,168,76,0.3)' },
    loadingText: { color: '#554E40', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
    header: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
    minimizeBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    roomName: { color: '#C8C4B8', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    tempBadge: { backgroundColor: '#FF8C00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tempTxt: { color: '#000', fontSize: 9, fontWeight: '900' },
    handIndicator: { backgroundColor: 'rgba(201,168,76,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    mainContent: { flex: 1 },
    videoArea: { flex: 1, justifyContent: 'space-between' },
    videoGrid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12 },
    tile: { backgroundColor: '#050505', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', position: 'relative', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 },
    tileLarge: { width: '80%', aspectRatio: 16/9, maxWidth: 900 },
    tileMedium: { width: '45%', aspectRatio: 16/9, maxWidth: 450 },
    tileFull: { width: '100%', aspectRatio: 16/9, maxWidth: 1000 },
    discord1v1Root: { flex: 1, width: '100%', height: '100%', position: 'relative' },
    tileFullscreen: { flex: 1, width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0, borderWidth: 0 },
    localPipOverlay: { position: 'absolute', bottom: 20, right: 20, width: 160, height: 220, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.8, shadowRadius: 12, elevation: 10 },
    tilePiP: { flex: 1, borderRadius: 12, overflow: 'hidden' },
    rtc: { flex: 1 },
    avatarTile: { flex: 1, backgroundColor: '#141210', justifyContent: 'center', alignItems: 'center' },
    avatarCircleSmall: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(201,168,76,0.2)' },
    avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(201,168,76,0.2)' },
    avatarCircleLarge: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(201,168,76,0.2)' },
    avatarCircleHuge: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(201,168,76,0.3)' },
    avatarTxtSmall: { color: '#C9A84C', fontSize: 24, fontWeight: '800' },
    avatarTxt: { color: '#C9A84C', fontSize: 32, fontWeight: '800' },
    avatarTxtLarge: { color: '#C9A84C', fontSize: 48, fontWeight: '800' },
    avatarTxtHuge: { color: '#C9A84C', fontSize: 64, fontWeight: '800' },

    participantOverlay: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6 },
    participantName: { color: '#E8E4D8', fontSize: 12, fontWeight: '700' },
    participantIcons: { flexDirection: 'row', gap: 6 },
    controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 24, backgroundColor: 'rgba(12,11,9,0.95)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    controlGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ctrlPill: { flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, backgroundColor: '#2B2D31', overflow: 'hidden', borderWidth: 1, borderColor: '#3F4147' },
    ctrlPillOff: { backgroundColor: '#ED4245', borderColor: '#ED4245' },
    ctrlPillMain: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
    ctrlDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' },
    ctrlPillArrow: { paddingHorizontal: 8, height: '100%', justifyContent: 'center' },
    ctrlBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#2B2D31', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#3F4147' },
    ctrlBtnActive: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: '#C9A84C' },
    ctrlBtnOff: { backgroundColor: '#ED4245', borderColor: '#ED4245' },
    hangupBtn: { width: 64, height: 46, borderRadius: 12, backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center', shadowColor: '#ED4245', shadowOpacity: 0.4, shadowRadius: 10 },
    screenSharePatina: { flex: 1, width: '100%', height: '100%', backgroundColor: '#141210', justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
    screenShareCenterBox: { alignItems: 'center', gap: 12 },
    screenShareIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(201,168,76,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#C9A84C' },
    screenShareMainTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
    screenShareSubTxt: { color: '#6E6960', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
    screenShareCentralBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ED4245', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    screenShareStopTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
    pipRoot: { flex: 1, backgroundColor: '#000' },
    pipVideoArea: { flex: 1 },
    pipControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 4, gap: 8, position: 'absolute', bottom: 4, left: 0, right: 0 },
    pipCtrl: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    chatPanel: { width: '100%', height: 250, backgroundColor: 'rgba(20,18,16,0.98)', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.2)' },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    chatTitle: { color: '#C9A84C', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
    chatScroll: { flex: 1, padding: 12 },
    chatInfo: { color: '#554E40', fontSize: 10, fontStyle: 'italic', marginBottom: 12, textAlign: 'center' },
    chatMsg: { marginBottom: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, alignSelf: 'flex-start', maxWidth: '85%' },
    chatMsgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(201,168,76,0.1)' },
    chatMsgSender: { color: '#C9A84C', fontSize: 11, fontWeight: '800', marginBottom: 2 },
    chatMsgText: { color: '#C8C4B8', fontSize: 14 },
    chatInputRow: { flexDirection: 'row', padding: 10, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    chatInput: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 8, paddingHorizontal: 12, height: 36, color: '#C8C4B8' },
    chatSendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },
    devicesWrapper: { position: 'relative' },
    deviceMenu: { position: 'absolute', bottom: 50, left: 0, backgroundColor: '#1C1A12', borderRadius: 8, padding: 8, minWidth: 200, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', zIndex: 100 },
    deviceItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
    deviceTxt: { color: '#E8E4D8', fontSize: 13, fontWeight: '600' }
});
