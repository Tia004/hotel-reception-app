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

// Funky Background Element Animation
const FunkyShape = ({ color, size, top, left, delay }) => {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    React.useEffect(() => {
        rotation.value = withDelay(delay, withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1, false));
        scale.value = withDelay(delay, withRepeat(withSequence(withTiming(1.3, { duration: 2000 }), withTiming(0.9, { duration: 2000 })), -1, true));
    }, []);

    const animStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `${rotation.value}deg` },
                { scale: scale.value }
            ]
        };
    });

    return (
        <Animated.View style={[
            {
                position: 'absolute',
                top, left,
                width: size, height: size,
                backgroundColor: color,
                borderRadius: size * 0.4,
                opacity: 0.9,
                borderWidth: 4,
                borderColor: '#000'
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
            {/* Pop-Art Background Elements */}
            <View style={styles.backgroundGrid} />
            {!remoteStream && (
                <>
                    <FunkyShape color="#B2FF05" size={250} top={50} left={-80} delay={0} />
                    <FunkyShape color="#FF0055" size={180} top={height * 0.4} left={width * 0.6} delay={800} />
                    <FunkyShape color="#00E5FF" size={220} top={height * 0.7} left={-40} delay={400} />
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
                    {/* Pop filter overlay */}
                    <View style={styles.remoteOverlayGradient} />

                    {/* Retrofuturism: CRT Scanlines */}
                    <View style={styles.scanlines} pointerEvents="none" />

                    {/* Brutalist Frame overlay */}
                    <View style={styles.brutalistFrame} pointerEvents="none">
                        {/* Collage Elements */}
                        <View style={[styles.sticker, { top: -20, right: -20, transform: [{ rotate: '15deg' }] }]}>
                            <Text style={{ fontSize: 50 }}>⚡</Text>
                        </View>
                        <View style={[styles.doodleTag, { bottom: 20, left: -20, transform: [{ rotate: '-8deg' }] }]}>
                            <Text style={styles.doodleText}>LIVE</Text>
                        </View>
                    </View>
                </Animated.View>
            ) : (
                <Animated.View entering={FadeIn} style={styles.noCallContainer}>
                    <View style={styles.headerContainer}>
                        <Text style={styles.logoTextShadow}>STANDBY</Text>
                        <Text style={styles.logoText}>STANDBY</Text>
                        <Text style={styles.waitingText}>NESSUNA CHIAMATA ATTIVA</Text>
                    </View>

                    <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.9}>
                        <View style={styles.logoutBtnShadow} />
                        <View style={styles.logoutBtnFront}>
                            <Text style={styles.logoutText}>X ESCI</Text>
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Floating Emojis Overlay */}
            <View style={styles.reactionOverlay} pointerEvents="none">
                {reactions.map(r => (
                    <FloatingEmoji key={r.id} emoji={r.emoji} />
                ))}
            </View>

            {/* Brutalist Local PiP */}
            <Animated.View entering={FadeInUp.delay(300).springify().damping(12)} style={styles.pipContainer}>
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

            {/* Pop-Art Control Bar */}
            <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.controlBar}>

                <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.8}>
                    <View style={styles.iconBtnBack}><Text style={styles.iconTextOff}>⚙️</Text></View>
                    <View style={styles.iconBtnFront}>
                        <Text style={styles.iconText}>⚙️</Text>
                    </View>
                </TouchableOpacity>

                {remoteStream ? (
                    <TouchableOpacity style={styles.mainBtnWrapper} onPress={endCall} activeOpacity={0.8}>
                        <View style={[styles.mainBtnShadow, { backgroundColor: '#000' }]} />
                        <View style={[styles.mainBtnFront, { backgroundColor: '#FF0055' }]}>
                            <Text style={styles.mainBtnText}>CHIUDI!</Text>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.mainBtnWrapper} onPress={() => setCallModalVisible(true)} activeOpacity={0.8}>
                        <View style={styles.mainBtnShadow} />
                        <View style={styles.mainBtnFront}>
                            <Text style={styles.mainBtnText}>CHIAMA ORA ➔</Text>
                        </View>
                    </TouchableOpacity>
                )}

                <EmojiContainer onSend={sendEmoji} />
            </Animated.View>

            {/* High-Contrast "Online Stations" Modal */}
            <Modal visible={callModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeaderDecor} />
                        <Text style={styles.modalTitle}>CONTATTI ONLINE</Text>

                        {onlineUsers.length === 0 ? <Text style={styles.noUsersText}>TUTTO TACE.</Text> : null}

                        <FlatList
                            data={onlineUsers}
                            keyExtractor={item => item.id}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <View style={styles.userRow}>
                                    <View>
                                        <Text style={styles.userRole}>{item.station.toUpperCase()}</Text>
                                        <Text style={styles.userName}>@{item.username.toUpperCase()}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.connectBtn} onPress={() => startCall(item.id)} activeOpacity={0.8}>
                                        <View style={styles.connectBtnShadow} />
                                        <View style={styles.connectBtnFront}>
                                            <Text style={styles.connectBtnText}>CHIAMA</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCallModalVisible(false)} activeOpacity={0.8}>
                            <View style={styles.cancelBtnShadow} />
                            <View style={styles.cancelBtnFront}>
                                <Text style={styles.cancelBtnText}>ANNULLA X</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
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

// Chaotic pop-art emoji floating
function FloatingEmoji({ emoji }) {
    const animValue = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        RNAnimated.spring(animValue, {
            toValue: 1,
            friction: 2,
            tension: 50,
            useNativeDriver: true,
        }).start();
    }, []);

    const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [50, -350] // Wild vertical pop
    });

    const translateX = animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, (Math.random() - 0.5) * 100, 0] // Random horizontal sway
    });

    const rotation = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', `${(Math.random() - 0.5) * 180}deg`] // Chaotic spin
    });

    const scale = animValue.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0, 2, 1.5, 0] // Massive Pop out
    });

    const opacity = animValue.interpolate({
        inputRange: [0, 0.8, 1],
        outputRange: [1, 1, 0] // Fade out at very top
    });

    return (
        <RNAnimated.View style={[styles.emojiContainer, { transform: [{ translateY }, { translateX }, { scale }, { rotate: rotation }], opacity }]}>
            <Text style={styles.emoji}>{emoji}</Text>
            {/* Gamification popup points */}
            <Text style={styles.scorePopup}>+10</Text>
        </RNAnimated.View>
    );
}

function EmojiContainer({ onSend }) {
    const [text, setText] = useState('');

    return (
        <View style={styles.emojiWrapper}>
            <View style={styles.iconBtnBack}><Text style={styles.iconTextOff}>😆</Text></View>
            <View style={styles.iconBtnFront}>
                <Text style={styles.iconText}>😆</Text>
            </View>
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

    modalOverlay: { flex: 1, backgroundColor: 'rgba(107, 56, 251, 0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: {
        width: '90%',
        maxWidth: 500,
        backgroundColor: '#B2FF05',
        padding: 30,
        borderWidth: 6,
        borderColor: '#000',
        shadowColor: '#000', shadowOffset: { height: 15, width: 15 }, shadowOpacity: 1, shadowRadius: 0,
        transform: [{ rotate: '1deg' }]
    },
    modalHeaderDecor: { position: 'absolute', top: -15, left: -20, width: 60, height: 60, backgroundColor: '#FF0055', borderRadius: 30, borderWidth: 4, borderColor: '#000' },
    modalTitle: { color: '#000000', fontSize: 32, fontWeight: '900', letterSpacing: -1, marginBottom: 25, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    noUsersText: { color: '#000', textAlign: 'center', marginBottom: 30, fontSize: 24, fontWeight: '900', backgroundColor: '#00E5FF', alignSelf: 'center', padding: 10, borderWidth: 2, borderColor: '#000', transform: [{ rotate: '-2deg' }] },
    userRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 4,
        borderColor: '#000',
        borderStyle: 'dashed'
    },
    userRole: { color: '#000000', fontSize: 18, fontWeight: '900' },
    userName: { color: '#FF0055', fontSize: 16, marginTop: 4, fontWeight: '900' },

    connectBtn: { width: 110, height: 45, position: 'relative' },
    connectBtnShadow: { position: 'absolute', top: 4, left: 4, width: '100%', height: '100%', backgroundColor: '#000' },
    connectBtnFront: { width: '100%', height: '100%', backgroundColor: '#00E5FF', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
    connectBtnText: { color: '#000000', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

    cancelBtn: { marginTop: 40, width: '100%', height: 60, position: 'relative' },
    cancelBtnShadow: { position: 'absolute', top: 5, left: 5, width: '100%', height: '100%', backgroundColor: '#000' },
    cancelBtnFront: { width: '100%', height: '100%', backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
    cancelBtnText: { color: '#FF0055', letterSpacing: 1, fontSize: 18, fontWeight: '900' },

    reactionOverlay: { position: 'absolute', bottom: 150, right: 80, width: 80, height: 400 },
    emojiContainer: { position: 'absolute', bottom: 0, alignSelf: 'center', alignItems: 'center' },
    emoji: { fontSize: 80, shadowColor: '#000', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0 },
    scorePopup: { color: '#B2FF05', fontSize: 24, fontWeight: '900', backgroundColor: '#000', padding: 5, borderWidth: 2, borderColor: '#B2FF05', marginTop: -15, transform: [{ rotate: '-15deg' }] },

    sticker: {
        position: 'absolute',
        shadowColor: '#000',
        shadowOffset: { width: 5, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0
    },
    doodleTag: {
        position: 'absolute',
        backgroundColor: '#FF0055',
        padding: 5,
        borderWidth: 3,
        borderColor: '#000',
        shadowColor: '#000',
        shadowOffset: { width: 5, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0
    },
    doodleText: {
        fontSize: 20,
        fontWeight: '900',
        color: '#000',
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    }
});
