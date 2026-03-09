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
        { urls: 'stun:stun.l.google.com:19302' }
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
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callModalVisible, setCallModalVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [reactions, setReactions] = useState([]);

    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const currentPeerId = useRef(null);
    const pendingCandidates = useRef([]); // ICE Candidate queue

    useEffect(() => {
        const s = io(SIGNALING_URL);
        setSocket(s);

        s.on('connect', () => {
            s.emit('join', user);
        });

        s.on('force-disconnect', (data) => {
            alert(`Disconnesso: ${data.reason}`);
            s.disconnect();
            onLogout();
        });

        s.on('users-update', (users) => {
            setOnlineUsers(users.filter(u => u.id !== s.id));
        });

        s.on('offer', async (data) => {
            if (!peerConnection.current) createPeerConnection(data.caller, s);
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates(); // Process queued candidates

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            s.emit('answer', { target: data.caller, caller: s.id, sdp: answer });
            currentPeerId.current = data.caller;
        });

        s.on('answer', async (data) => {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            processPendingCandidates(); // Process queued candidates
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
                    // Queue candidate until remote description is set
                    pendingCandidates.current.push(data.candidate);
                }
            }
        });

        startLocalStream();

        return () => {
            s.disconnect();
            if (peerConnection.current) peerConnection.current.close();
            if (localStream) localStream.getTracks().forEach(track => track.stop());
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
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
            }

            const constraints = {
                audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
                video: videoDeviceId ? { deviceId: videoDeviceId } : true
            };

            const stream = await mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);

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
            console.error('Failed to get local stream', e);
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
            // Fix for multiple tracks, grab the primary stream
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            } else {
                // Fallback if needed
                const newStream = new MediaStream([event.track]);
                setRemoteStream(newStream);
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        peerConnection.current = pc;
    };

    const startCall = async (targetId) => {
        setCallModalVisible(false);
        createPeerConnection(targetId, socket);
        currentPeerId.current = targetId;

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        socket.emit('offer', { target: targetId, caller: socket.id, sdp: offer });
    };

    const endCall = () => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
            setRemoteStream(null);
            if (currentPeerId.current) {
                socket.emit('call-ended', { target: currentPeerId.current });
                currentPeerId.current = null;
            }
        }
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
            {!remoteStream && (
                <>
                    <AmbientGlow color="#1e1836" size={400} top={50} left={-80} delay={0} />
                    <AmbientGlow color="#3a2e1d" size={300} top={height * 0.4} left={width * 0.6} delay={2000} />
                </>
            )}

            {/* Remote Video Background */}
            {remoteStream ? (
                <Animated.View entering={FadeIn.duration(800)} style={styles.remoteVideoContainer}>
                    {/* BUG FIX: Pass raw stream on Web, toURL() on Native */}
                    <RTCView
                        streamURL={Platform.OS === 'web' ? remoteStream : remoteStream.toURL()}
                        style={styles.remoteVideo}
                        objectFit="cover"
                    />
                    {/* Soft dark elegant overlay */}
                    <LinearGradient
                        colors={['rgba(10,10,12,0.8)', 'rgba(10,10,12,0.2)', 'rgba(10,10,12,0.8)']}
                        style={styles.remoteOverlayGradient}
                    />
                </Animated.View>
            ) : (
                <Animated.View entering={FadeIn} style={styles.noCallContainer}>
                    <View style={styles.headerContainer}>
                        <Text style={styles.logoText}>IN ATTESA</Text>
                        <Text style={styles.waitingText}>NESSUNA COMUNICAZIONE IN CORSO</Text>
                    </View>

                    <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
                        <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']} style={styles.logoutBtnGradient}>
                            <Text style={styles.logoutText}>ESCI</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Floating Emojis Overlay */}
            <View style={styles.reactionOverlay} pointerEvents="none">
                {reactions.map(r => (
                    <FloatingEmoji key={r.id} emoji={r.emoji} />
                ))}
            </View>

            {/* High-End Local PiP */}
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

            {/* Premium Control Bar */}
            <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.controlBarWrapper}>
                <LinearGradient colors={['rgba(20, 20, 25, 0.85)', 'rgba(10, 10, 15, 0.95)']} style={styles.controlBar}>

                    <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.7}>
                        <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']} style={styles.iconBtnGradient}>
                            <Text style={styles.iconText}>⚙️</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {remoteStream ? (
                        <TouchableOpacity style={styles.mainBtnWrapper} onPress={endCall} activeOpacity={0.8}>
                            <LinearGradient colors={['#FF4B4B', '#CC2222']} style={styles.mainBtnGradient}>
                                <Text style={styles.mainBtnText}>TERMINA</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.mainBtnWrapper} onPress={() => setCallModalVisible(true)} activeOpacity={0.8}>
                            <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.mainBtnGradient}>
                                <Text style={styles.mainBtnTextDark}>CHIAMA ORA ➔</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    <EmojiContainer onSend={sendEmoji} />
                </LinearGradient>
            </Animated.View>

            {/* Elegant Glass Contacts Modal */}
            <Modal visible={callModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <LinearGradient colors={['rgba(30, 30, 35, 0.95)', 'rgba(15, 15, 20, 0.98)']} style={styles.modalContent}>
                        <Text style={styles.modalTitle}>POSTAZIONI ATTIVE</Text>

                        {onlineUsers.length === 0 ? <Text style={styles.noUsersText}>Nessuna postazione online.</Text> : null}

                        <FlatList
                            data={onlineUsers}
                            keyExtractor={item => item.id}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <View style={styles.userRow}>
                                    <View>
                                        <Text style={styles.userRole}>{item.station}</Text>
                                        <Text style={styles.userName}>@{item.username}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.connectBtn} onPress={() => startCall(item.id)} activeOpacity={0.8}>
                                        <LinearGradient colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']} style={styles.connectBtnGradient}>
                                            <Text style={styles.connectBtnText}>CHIAMA</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCallModalVisible(false)} activeOpacity={0.8}>
                            <Text style={styles.cancelBtnText}>ANNULLA</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>

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
    backgroundGrid: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0,
    },

    remoteVideoContainer: { flex: 1, backgroundColor: '#050505' },
    remoteVideo: { flex: 1, width: '100%', height: '100%', position: 'absolute' },
    remoteOverlayGradient: { flex: 1, backgroundColor: 'rgba(0,0, 0, 0.3)' },
    scanlines: { opacity: 0 },
    brutalistFrame: { opacity: 0 },

    noCallContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0C', zIndex: 10 },
    headerContainer: { position: 'relative', alignItems: 'center' },
    logoTextShadow: { opacity: 0 },
    logoText: { color: '#FFFFFF', fontSize: 32, letterSpacing: 6, fontWeight: '200', textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'sans-serif' : (Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-light') },
    waitingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 4, fontWeight: '400', marginTop: 15, textTransform: 'uppercase' },

    logoutBtn: { position: 'absolute', top: 50, left: 25, zIndex: 100 },
    logoutBtnGradient: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
    logoutText: { color: 'rgba(255,255,255,0.5)', fontWeight: '400', fontSize: 11, letterSpacing: 2 },

    pipContainer: {
        position: 'absolute',
        top: 30,
        right: 30,
        width: 120,
        height: 160,
        backgroundColor: '#000',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15,
        elevation: 10,
    },
    pipVideo: { flex: 1, width: '100%', height: '100%' },
    pipPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
    pipPlaceholderText: { color: 'rgba(255,255,255,0.3)', fontWeight: '300', fontSize: 12, textAlign: 'center' },

    controlBarWrapper: {
        position: 'absolute',
        bottom: 40,
        width: '100%',
        alignItems: 'center',
    },
    controlBar: {
        flexDirection: 'row',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 100,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20,
    },

    iconBtn: { width: 50, height: 50, borderRadius: 25, marginRight: 15, overflow: 'hidden' },
    iconBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    iconText: { fontSize: 22 },
    iconTextOff: { fontSize: 22, opacity: 0.3 },

    mainBtnWrapper: { width: 200, height: 54, borderRadius: 27, overflow: 'hidden' },
    mainBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    mainBtnText: { color: '#000', fontWeight: '700', letterSpacing: 2, fontSize: 14 },
    mainBtnTextDark: { color: '#000', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

    emojiWrapper: { width: 50, height: 50, marginLeft: 15, justifyContent: 'center', alignItems: 'center' },
    emojiInput: { width: '100%', height: '100%', position: 'absolute', opacity: 0 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 25,
        padding: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000', shadowOffset: { height: 15, width: 0 }, shadowOpacity: 0.8, shadowRadius: 30,
        overflow: 'hidden'
    },
    modalTitle: { color: '#FFF', fontSize: 16, fontWeight: '400', letterSpacing: 2, marginBottom: 25, textAlign: 'center' },
    noUsersText: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 20, fontSize: 14, fontStyle: 'italic' },
    userRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    userRole: { color: '#D4AF37', fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    userName: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4, fontWeight: '400' },

    connectBtn: { width: 90, height: 40, borderRadius: 20, overflow: 'hidden' },
    connectBtnGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    connectBtnText: { color: '#FFF', fontSize: 11, fontWeight: '600', letterSpacing: 1 },

    cancelBtn: { marginTop: 30, width: '100%', paddingVertical: 15, alignItems: 'center' },
    cancelBtnText: { color: 'rgba(255,255,255,0.5)', letterSpacing: 2, fontSize: 12, fontWeight: '600' },

    reactionOverlay: { position: 'absolute', bottom: 120, right: 20, width: 80, height: 300 },
    emojiContainer: { position: 'absolute', bottom: 0, alignSelf: 'center', alignItems: 'center' },
    emoji: { fontSize: 45, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10 },
});

