import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Animated as RNAnimated, TextInput, Platform, Dimensions } from 'react-native';
import io from 'socket.io-client';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import MediaSettings from './MediaSettings';
import Animated, { FadeIn, FadeInUp, FadeOutDown, SlideInDown, SlideOutDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
// Use environment variable for production (e.g. Render), fallback to local IP
const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || `http://192.168.1.46:3000`;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ]
};

// Ambient Glow Animation (Slow breathing instead of chaotic rotation)
const AmbientGlow = ({ color, size, top, left, delay }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.4);

    React.useEffect(() => {
        scale.value = withDelay(delay, withRepeat(withSequence(withTiming(1.3, { duration: 6000, easing: Easing.inOut(Easing.ease) }), withTiming(0.9, { duration: 6000, easing: Easing.inOut(Easing.ease) })), -1, true));
        opacity.value = withDelay(delay, withRepeat(withSequence(withTiming(0.7, { duration: 6000, easing: Easing.inOut(Easing.ease) }), withTiming(0.4, { duration: 6000, easing: Easing.inOut(Easing.ease) })), -1, true));
    }, []);

    const animStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value
        };
    });

    return (
        <Animated.View style={[
            {
                position: 'absolute',
                top, left,
                width: size, height: size,
                backgroundColor: color,
                borderRadius: size / 2,
                ...(Platform.OS === 'web' ? { filter: 'blur(80px)', opacity: 0.5 } : { opacity: 0.2, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 50 })
            },
            animStyle
        ]} />
    );
};

export default function CallScreen({ user, onLogout }) {
    const [socket, setSocket] = useState(null);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const localStreamRef = useRef(null); // Fix for stale closure WebRTC bugs
    const [remoteStream, setRemoteStream] = useState(null);
    const [profileMenuVisible, setProfileMenuVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [reactions, setReactions] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('Svegliando il server...');

    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const currentPeerId = useRef(null);
    const pendingCandidates = useRef([]); // ICE Candidate queue

    useEffect(() => {
        // Wake up Render free-tier server explicitly before Socket.io
        fetch(`${SIGNALING_URL}/ping`)
            .then(() => setConnectionStatus('Connessione in corso...'))
            .catch(() => setConnectionStatus('Errore: Server Non Raggiungibile'));

        // Removed forced websockets to allow fallback to polling on strict proxy networks
        const s = io(SIGNALING_URL);
        setSocket(s);

        s.on('connect', () => {
            console.log("Connected to signaling server as", user.username);
            setConnectionStatus('Connesso!');
            s.emit('join', user);
        });

        s.on('connect_error', (err) => {
            console.log("Connection Error:", err.message);
            setConnectionStatus(`Errore Connessione: ${err.message}`);
        });

        s.on('disconnect', (reason) => {
            console.log("Disconnected:", reason);
            setConnectionStatus(`Disconnesso: ${reason}`);
        });

        s.on('force-disconnect', (data) => {
            alert(`Disconnesso: ${data.reason}`);
            s.disconnect();
            onLogout();
        });

        s.on('rooms-update', (rooms) => {
            setAvailableRooms(rooms);
        });

        s.on('room-created', ({ roomId }) => {
            setCurrentRoom(roomId);
            console.log("Room created:", roomId);
        });

        s.on('room-joined', async ({ roomId, peers }) => {
            setCurrentRoom(roomId);
            console.log("Joined room:", roomId, "Peers:", peers);
            const creatorId = peers.find(id => id !== s.id);
            if (creatorId) {
                startCall(creatorId, s);
            }
        });

        s.on('room-error', ({ message }) => {
            alert(`Errore Stanza: ${message}`);
        });

        s.on('user-joined-room', ({ socketId, username }) => {
            console.log(`${username} joined the room! Waiting for their offer...`);
        });

        s.on('user-left-room', () => {
            console.log("Other peer left the room.");
            if (peerConnection.current) {
                peerConnection.current.close();
                peerConnection.current = null;
            }
            setRemoteStream(null);
            currentPeerId.current = null;
            setCurrentRoom(null);
            alert("L'altro utente ha abbandonato la stanza.");
        });

        s.on('offer', async (data) => {
            console.log("Received OFFER from", data.caller);
            if (!peerConnection.current) createPeerConnection(data.caller, s);
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates();

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            s.emit('answer', { target: data.caller, caller: s.id, sdp: answer });
            currentPeerId.current = data.caller;
            console.log("Sent ANSWER to", data.caller);
        });

        s.on('answer', async (data) => {
            console.log("Received ANSWER from", data.caller);
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates();
        });

        s.on('ice-candidate', async (data) => {
            if (peerConnection.current) {
                if (peerConnection.current.remoteDescription) {
                    try {
                        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) {
                        console.error("Error adding ice candidate", e);
                    }
                } else {
                    pendingCandidates.current.push(data.candidate);
                }
            }
        });

        startLocalStream();

        return () => {
            s.disconnect();
            if (peerConnection.current) peerConnection.current.close();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
        };
    }, []);

    const processPendingCandidates = () => {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
            pendingCandidates.current.forEach(async (candidate) => {
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error("Error adding queued ice candidate", e);
                }
            });
            pendingCandidates.current = [];
        }
    };

    const startLocalStream = async (videoDeviceId = null, audioDeviceId = null) => {
        if (!mediaDevices || !mediaDevices.getUserMedia) {
            alert("Attenzione: La fotocamera e il microfono sono bloccati. I browser su cellulari richiedono una connessione sicura (HTTPS) per accedere alla fotocamera. Il video in locale funzionerà solo sul server di produzione (es. Render).");
            return;
        }

        try {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }

            const constraints = {
                audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
                video: videoDeviceId ? { deviceId: videoDeviceId } : true
            };

            const stream = await mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            localStreamRef.current = stream;
            console.log("Local media stream acquired. Video tracks:", stream.getVideoTracks().length);

            if (peerConnection.current) {
                const senders = peerConnection.current.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                    } else {
                        peerConnection.current.addTrack(track, stream);
                    }
                });
            }
        } catch (e) {
            console.error('Failed to get local stream. Permissions denied or hardware missing.', e);
        }
    };

    const createPeerConnection = (targetId, currentSocket) => {
        const pc = new RTCPeerConnection(configuration);

        const dc = pc.createDataChannel('emoji');
        dc.onmessage = (event) => {
            handleReceiveEmoji(event.data);
        };
        dataChannel.current = dc;

        pc.ondatachannel = (event) => {
            event.channel.onmessage = (e) => {
                handleReceiveEmoji(e.data);
            };
            dataChannel.current = event.channel;
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                currentSocket.emit('ice-candidate', { target: targetId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log("ONTRACK event received. Streams available:", event.streams ? event.streams.length : 0);
            // Fix for multiple tracks, grab the primary stream
            if (event.streams && event.streams[0]) {
                console.log("Setting remote stream from event.streams[0]");
                setRemoteStream(event.streams[0]);
            } else {
                console.log("Fallback: creating new MediaStream from event.track");
                // Fallback if needed
                const newStream = new MediaStream([event.track]);
                setRemoteStream(newStream);
            }
        };

        if (localStreamRef.current) {
            console.log("Adding local tracks to PeerConnection:", localStreamRef.current.getTracks().length);
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        } else {
            console.log("WARNING: localStreamRef.current is null! Sending call without video/audio tracks.");
        }

        peerConnection.current = pc;
    };

    const createRoom = () => {
        if (socket) socket.emit('create-room');
    };

    const joinRoom = (roomId) => {
        if (socket) socket.emit('join-room', { roomId });
    };

    const startCall = async (targetId, currentSocket = socket) => {
        createPeerConnection(targetId, currentSocket);
        currentPeerId.current = targetId;

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        currentSocket.emit('offer', { target: targetId, caller: currentSocket.id, sdp: offer });
    };

    const leaveRoom = () => {
        if (socket) socket.emit('leave-room');
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        setRemoteStream(null);
        currentPeerId.current = null;
        setCurrentRoom(null);
    };

    const handleReceiveEmoji = (emoji) => {
        const id = Date.now().toString() + Math.random().toString();
        setReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== id));
        }, 2500); // Faster pop
    };

    const sendEmoji = (emoji) => {
        if (dataChannel.current && dataChannel.current.readyState === 'open') {
            dataChannel.current.send(emoji);
            handleReceiveEmoji(emoji);
        }
    };

    const updateMediaDevices = ({ videoDeviceId, audioDeviceId, audioOutputId }) => {
        startLocalStream(videoDeviceId, audioDeviceId);
    };

    return (
        <View style={styles.container}>
            {/* Elegant Dark Background Elements */}
            {!currentRoom && (
                <>
                    <AmbientGlow color="#1e1836" size={400} top={50} left={-80} delay={0} />
                    <AmbientGlow color="#3a2e1d" size={300} top={height * 0.4} left={width * 0.6} delay={2000} />
                </>
            )}

            {/* Remote Video Background */}
            {remoteStream ? (
                <Animated.View entering={FadeIn.duration(800)} style={styles.remoteVideoContainer}>
                    <RTCView
                        streamURL={Platform.OS === 'web' ? remoteStream : remoteStream.toURL()}
                        style={styles.remoteVideo}
                        objectFit="cover"
                    />
                    <LinearGradient
                        colors={['rgba(10,10,12,0.8)', 'rgba(10,10,12,0.2)', 'rgba(10,10,12,0.8)']}
                        style={styles.remoteOverlayGradient}
                    />
                </Animated.View>
            ) : null}

            {/* Lobby UI */}
            {!currentRoom && (
                <Animated.View entering={FadeIn} style={styles.lobbyContainer}>
                    <View style={styles.headerContainer}>
                        <Text style={styles.logoText}>RECEPTION</Text>
                        <Text style={styles.waitingText}>STANZE VIRTUALI</Text>
                        <Text style={styles.diagnosticText}>Server: {SIGNALING_URL}</Text>
                        <Text style={[styles.diagnosticText, { color: connectionStatus.includes('Errore') || connectionStatus.includes('Disconnesso') ? '#FF4B4B' : (connectionStatus.includes('Connesso!') ? '#4BFF4B' : '#D4AF37') }]}>
                            Stato: {connectionStatus}
                        </Text>
                    </View>

                    <TouchableOpacity style={styles.createRoomBtn} onPress={createRoom} activeOpacity={0.8}>
                        <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.createBtnGradient}>
                            <Text style={styles.createBtnText}>CREA STANZA ➔</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.roomsListContainer}>
                        <Text style={styles.roomsListTitle}>STANZE DISPONIBILI</Text>
                        {availableRooms.length === 0 ? (
                            <Text style={styles.noRoomsText}>Nessuna stanza al momento.</Text>
                        ) : (
                            <FlatList
                                data={availableRooms}
                                keyExtractor={item => item.id}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => (
                                    <View style={styles.roomRow}>
                                        <View>
                                            <Text style={styles.roomName}>{item.name}</Text>
                                            <Text style={styles.roomCreator}>Creata da @{item.creatorName}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.joinBtn} onPress={() => joinRoom(item.id)} activeOpacity={0.8}>
                                            <LinearGradient colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']} style={styles.connectBtnGradient}>
                                                <Text style={styles.connectBtnText}>ENTRA</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        )}
                    </View>
                </Animated.View>
            )}

            {/* In-Call UI */}
            {currentRoom && (
                <>
                    {/* Reaction Overlay */}
                    <View style={styles.reactionOverlay} pointerEvents="none">
                        {reactions.map(r => (
                            <FloatingEmoji key={r.id} emoji={r.emoji} />
                        ))}
                    </View>

                    {/* Local PiP */}
                    <Animated.View entering={FadeInUp.delay(300).springify().damping(15)} style={styles.pipContainer}>
                        {localStream ? (
                            <RTCView
                                streamURL={Platform.OS === 'web' ? localStream : localStream.toURL()}
                                style={styles.pipVideo}
                                objectFit="cover"
                                zOrder={1}
                                mirror={true}
                            />
                        ) : (
                            <View style={styles.pipPlaceholder}><Text style={styles.pipPlaceholderText}>NON DISPONIBILE</Text></View>
                        )}
                    </Animated.View>

                    {/* Control Bar */}
                    <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.controlBarWrapper}>
                        <View style={styles.roomCodeBadge}>
                            <Text style={styles.roomCodeText}>Stanza: {currentRoom}</Text>
                        </View>
                        <LinearGradient colors={['rgba(20, 20, 25, 0.85)', 'rgba(10, 10, 15, 0.95)']} style={styles.controlBar}>
                            <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.7}>
                                <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']} style={styles.iconBtnGradient}>
                                    <Text style={styles.iconText}>⚙️</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.mainBtnWrapper} onPress={leaveRoom} activeOpacity={0.8}>
                                <LinearGradient colors={['#FF4B4B', '#CC2222']} style={styles.mainBtnGradient}>
                                    <Text style={styles.mainBtnText}>ABBANDONA</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <EmojiContainer onSend={sendEmoji} />
                        </LinearGradient>
                    </Animated.View>
                </>
            )}

            {/* Top Right Profile Menu */}
            {!currentRoom && (
                <View style={styles.profileContainer}>
                    <TouchableOpacity onPress={() => setProfileMenuVisible(!profileMenuVisible)} style={styles.profileAvatar} activeOpacity={0.8}>
                        <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.profileAvatarGradient}>
                            <Text style={styles.profileAvatarText}>{user.username.charAt(0).toUpperCase()}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    {profileMenuVisible && (
                        <Animated.View entering={FadeInUp.duration(200)} style={styles.profileDropdown}>
                            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); setSettingsVisible(true); }}>
                                <Text style={styles.dropdownItemText}>⚙️ Impostazioni User</Text>
                            </TouchableOpacity>
                            <View style={styles.dropdownDivider} />
                            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); onLogout(); }}>
                                <Text style={styles.dropdownItemTextLogout}>🚪 Esci</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </View>
            )}

            {/* Impostazioni Modale */}
            <MediaSettings
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                onUpdateDevices={updateMediaDevices}
            />
        </View>
    );
}

// Soft floating emoji animation (no chaotic spin)
function FloatingEmoji({ emoji }) {
    const animValue = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        RNAnimated.timing(animValue, {
            toValue: 1,
            duration: 2500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start();
    }, []);

    const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [20, -150]
    });

    const scale = animValue.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0.5, 1.2, 1, 0.8]
    });

    const opacity = animValue.interpolate({
        inputRange: [0, 0.8, 1],
        outputRange: [0, 1, 0]
    });

    return (
        <RNAnimated.View style={[styles.emojiContainer, { transform: [{ translateY }, { scale }], opacity }]}>
            <Text style={styles.emoji}>{emoji}</Text>
        </RNAnimated.View>
    );
}

function EmojiContainer({ onSend }) {
    const [text, setText] = useState('');

    return (
        <View style={styles.emojiWrapper}>
            <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']} style={styles.iconBtnGradient}>
                <Text style={styles.iconText}>😆</Text>
            </LinearGradient>
            <TextInput
                style={styles.emojiInput}
                value={text}
                onChangeText={(val) => {
                    if (val && val.trim().length > 0) {
                        onSend(val);
                        setText('');
                    }
                }}
                placeholder=""
                autoCorrect={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },

    remoteVideoContainer: { flex: 1, backgroundColor: '#050505' },
    remoteVideo: { flex: 1, width: '100%', height: '100%', position: 'absolute' },
    remoteOverlayGradient: { flex: 1, backgroundColor: 'rgba(0,0, 0, 0.3)' },

    lobbyContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: '#0A0A0C', zIndex: 10, paddingTop: height * 0.15 },
    headerContainer: { position: 'relative', alignItems: 'center', marginBottom: 40 },
    logoText: { color: '#FFFFFF', fontSize: 32, letterSpacing: 6, fontWeight: '200', textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'sans-serif' : (Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-light') },
    waitingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 4, fontWeight: '400', marginTop: 15, textTransform: 'uppercase' },
    diagnosticText: { color: 'rgba(212, 175, 55, 0.7)', fontSize: 10, letterSpacing: 1, fontWeight: '300', marginTop: 8, fontStyle: 'italic' },

    createRoomBtn: { width: 250, height: 60, borderRadius: 30, overflow: 'hidden', marginBottom: 40, shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
    createBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    createBtnText: { color: '#000', fontWeight: '700', letterSpacing: 3, fontSize: 15 },

    roomsListContainer: { width: '90%', maxWidth: 500, backgroundColor: 'rgba(20, 20, 25, 0.8)', borderRadius: 20, padding: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    roomsListTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 3, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
    noRoomsText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: 13, fontStyle: 'italic', paddingVertical: 20 },

    roomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    roomName: { color: '#D4AF37', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
    roomCreator: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4, fontWeight: '400' },
    joinBtn: { width: 90, height: 40, borderRadius: 20, overflow: 'hidden' },

    connectBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    connectBtnText: { color: '#FFF', fontSize: 11, fontWeight: '600', letterSpacing: 1 },

    /* Profile Dropdown */
    profileContainer: { position: 'absolute', top: Platform.OS === 'web' ? 30 : 50, right: 30, zIndex: 100, alignItems: 'flex-end' },
    profileAvatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', shadowColor: '#000', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.5, shadowRadius: 10 },
    profileAvatarGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    profileAvatarText: { color: '#000', fontSize: 20, fontWeight: '700' },
    profileDropdown: { marginTop: 10, width: 220, backgroundColor: 'rgba(25, 25, 30, 0.95)', borderRadius: 15, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { height: 10, width: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
    dropdownItem: { paddingVertical: 14, paddingHorizontal: 15, borderRadius: 10 },
    dropdownItemText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
    dropdownItemTextLogout: { color: '#FF4B4B', fontSize: 14, fontWeight: '600' },
    dropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 5 },

    pipContainer: { position: 'absolute', top: 30, right: 30, width: 120, height: 160, backgroundColor: '#000', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 },
    pipVideo: { flex: 1, width: '100%', height: '100%' },
    pipPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
    pipPlaceholderText: { color: 'rgba(255,255,255,0.3)', fontWeight: '300', fontSize: 12, textAlign: 'center' },

    controlBarWrapper: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
    roomCodeBadge: { backgroundColor: 'rgba(212, 175, 55, 0.2)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.5)' },
    roomCodeText: { color: '#D4AF37', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
    controlBar: { flexDirection: 'row', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 100, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20 },
    iconBtn: { width: 50, height: 50, borderRadius: 25, marginRight: 15, overflow: 'hidden' },
    iconBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    iconText: { fontSize: 22 },

    mainBtnWrapper: { width: 200, height: 54, borderRadius: 27, overflow: 'hidden' },
    mainBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    mainBtnText: { color: '#000', fontWeight: '700', letterSpacing: 2, fontSize: 14 },
    mainBtnTextDark: { color: '#000', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

    emojiWrapper: { width: 50, height: 50, marginLeft: 15, justifyContent: 'center', alignItems: 'center' },
    emojiInput: { width: '100%', height: '100%', position: 'absolute', opacity: 0 },

    reactionOverlay: { position: 'absolute', bottom: 120, right: 20, width: 80, height: 300 },
    emojiContainer: { position: 'absolute', bottom: 0, alignSelf: 'center', alignItems: 'center' },
    emoji: { fontSize: 45, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10 },
});

