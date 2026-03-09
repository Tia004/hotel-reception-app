import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Animated as RNAnimated, TextInput, Platform, Dimensions } from 'react-native';
import io from 'socket.io-client';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import MediaSettings from './MediaSettings';
import Animated, { FadeIn, FadeInUp, FadeOutDown, SlideInDown, SlideOutDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const SIGNALING_URL = 'http://localhost:3000'; // Hardcoded for prototype

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

import { LinearGradient } from 'expo-linear-gradient';

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
                ...(Platform.OS === 'web' ? { filter: 'blur(80px)' } : { opacity: 0.2, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 50 })
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

    useEffect(() => {
        const s = io(SIGNALING_URL);
        setSocket(s);

        s.on('connect', () => {
            s.emit('join', user);
        });

        s.on('users-update', (users) => {
            setOnlineUsers(users.filter(u => u.id !== s.id));
        });

        s.on('offer', async (data) => {
            if (!peerConnection.current) createPeerConnection(data.caller, s);
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            s.emit('answer', { target: data.caller, caller: s.id, sdp: answer });
            currentPeerId.current = data.caller;
        });

        s.on('answer', async (data) => {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        });

        s.on('ice-candidate', async (data) => {
            if (peerConnection.current) {
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error("Error adding ice candidate", e);
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

    const startLocalStream = async (videoDeviceId = null, audioDeviceId = null) => {
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
    container: { flex: 1, backgroundColor: '#6B38FB', overflow: 'hidden' }, // Electric Purple
    backgroundGrid: {
        position: 'absolute',
        width: '200%',
        height: '200%',
        opacity: 0.2,
        borderWidth: 2,
        borderColor: '#000',
        borderStyle: 'dashed'
    },

    remoteVideoContainer: { flex: 1, backgroundColor: '#B2FF05' },
    remoteVideo: { flex: 1, width: '100%', height: '100%', position: 'absolute' },
    remoteOverlayGradient: { flex: 1, backgroundColor: 'rgba(107, 56, 251, 0.2)' /* Purple tint mix */ },
    scanlines: {
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 2,
        borderColor: '#000',
        borderStyle: 'dashed', // Cheap CRT scanline simulation based on prior dash techniques
        opacity: 0.8
    },
    brutalistFrame: {
        position: 'absolute',
        top: 20, left: 20, right: 20, bottom: 120,
        borderWidth: 6,
        borderColor: '#B2FF05',
        shadowColor: '#000', shadowOffset: { width: 10, height: 10 }, shadowOpacity: 1, shadowRadius: 0
    },

    noCallContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#6B38FB', zIndex: 10 },
    headerContainer: { position: 'relative', alignItems: 'center' },
    logoTextShadow: { position: 'absolute', top: 5, left: 5, color: '#B2FF05', fontSize: 50, letterSpacing: -2, fontWeight: '900', transform: [{ rotate: '-3deg' }], fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    logoText: { color: '#FFFFFF', fontSize: 50, letterSpacing: -2, fontWeight: '900', marginBottom: 5, transform: [{ rotate: '-3deg' }], zIndex: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    waitingText: { color: '#00E5FF', fontSize: 20, letterSpacing: 4, fontWeight: '900', backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 5, transform: [{ rotate: '2deg' }] },

    logoutBtn: { position: 'absolute', top: 60, left: 30, width: 100, height: 50 },
    logoutBtnShadow: { position: 'absolute', top: 4, left: 4, width: '100%', height: '100%', backgroundColor: '#000', borderWidth: 2, borderColor: '#000' },
    logoutBtnFront: { width: '100%', height: '100%', backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
    logoutText: { color: '#FF0055', fontWeight: '900', fontSize: 16 },

    pipContainer: {
        position: 'absolute',
        top: 60,
        right: 30,
        width: 140,
        height: 180,
        backgroundColor: '#FFFFFF',
        borderWidth: 4,
        borderColor: '#000',
        shadowColor: '#000', shadowOffset: { width: 10, height: 10 }, shadowOpacity: 1, shadowRadius: 0,
        elevation: 8,
        transform: [{ rotate: '3deg' }] // Funky tilt
    },
    pipVideo: { flex: 1, width: '100%', height: '100%' },
    pipPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FF0055' },
    pipPlaceholderText: { color: '#000', fontWeight: '900', fontSize: 18, textAlign: 'center', transform: [{ rotate: '-10deg' }] },

    controlBar: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        paddingVertical: 15,
        paddingHorizontal: 25,
        borderWidth: 4,
        borderColor: '#000',
        shadowColor: '#000', shadowOffset: { width: 8, height: 8 }, shadowOpacity: 1, shadowRadius: 0,
        elevation: 5,
        alignItems: 'center',
        transform: [{ rotate: '-1deg' }]
    },

    iconBtn: { width: 60, height: 60, position: 'relative', marginRight: 15 },
    iconBtnBack: { position: 'absolute', top: 4, left: 4, width: '100%', height: '100%', backgroundColor: '#000', borderRadius: 30 },
    iconBtnFront: { width: '100%', height: '100%', backgroundColor: '#00E5FF', borderRadius: 30, borderWidth: 3, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
    iconText: { fontSize: 26 },
    iconTextOff: { fontSize: 26, opacity: 0 },

    mainBtnWrapper: { width: 220, height: 65, position: 'relative' },
    mainBtnShadow: { position: 'absolute', top: 6, left: 6, width: '100%', height: '100%', backgroundColor: '#000', borderWidth: 3, borderColor: '#000' },
    mainBtnFront: { width: '100%', height: '100%', backgroundColor: '#B2FF05', borderWidth: 3, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
    mainBtnText: { color: '#000000', fontWeight: '900', letterSpacing: 1.5, fontSize: 18 },

    emojiWrapper: { width: 60, height: 60, position: 'relative', marginLeft: 15 },
    emojiInput: { width: '100%', height: '100%', position: 'absolute', opacity: 0 }, // Invisible input loop

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 25,
        padding: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000', shadowOffset: { height: 15, width: 0 }, shadowOpacity: 0.8, shadowRadius: 30,
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

    connectBtn: { width: 90, height: 40 },
    connectBtnGradient: { width: '100%', height: '100%', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    connectBtnText: { color: '#FFF', fontSize: 11, fontWeight: '600', letterSpacing: 1 },

    cancelBtn: { marginTop: 30, width: '100%', paddingVertical: 15, alignItems: 'center' },
    cancelBtnText: { color: 'rgba(255,255,255,0.5)', letterSpacing: 2, fontSize: 12, fontWeight: '600' },

    reactionOverlay: { position: 'absolute', bottom: 120, right: 20, width: 80, height: 300 },
    emojiContainer: { position: 'absolute', bottom: 0, alignSelf: 'center', alignItems: 'center' },
    emoji: { fontSize: 45, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10 },
});
