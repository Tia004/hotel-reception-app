import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Animated as RNAnimated, TextInput } from 'react-native';
import io from 'socket.io-client';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import MediaSettings from './MediaSettings';
import Animated, { FadeIn, FadeInUp, FadeOutDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';

const SIGNALING_URL = 'http://localhost:3000'; // Hardcoded for prototype

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
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
            setRemoteStream(event.streams[0]);
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
            // Inform the other peer
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
        }, 3500);
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
            {/* Remote Video Background */}
            {remoteStream ? (
                <Animated.View entering={FadeIn.duration(1000)} style={styles.remoteVideoContainer}>
                    <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
                    <View style={styles.remoteOverlayGradient} />
                </Animated.View>
            ) : (
                <Animated.View entering={FadeIn} style={styles.noCallContainer}>
                    <Text style={styles.logoText}>RECEPTION</Text>
                    <Text style={styles.waitingText}>In attesa di connessione...</Text>

                    <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                        <Text style={styles.logoutText}>ESC</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Floating Emojis Overlay */}
            <View style={styles.reactionOverlay} pointerEvents="none">
                {reactions.map(r => (
                    <FloatingEmoji key={r.id} emoji={r.emoji} />
                ))}
            </View>

            {/* Modern Local PiP with organic shape and soft shadow */}
            <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.pipContainer}>
                {localStream ? (
                    <RTCView streamURL={localStream.toURL()} style={styles.pipVideo} objectFit="cover" zOrder={1} mirror={true} />
                ) : (
                    <View style={styles.pipPlaceholder}><Text style={styles.pipPlaceholderText}>Camera offline</Text></View>
                )}
            </Animated.View>

            {/* Warm Glassmorphism Control Bar */}
            <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.controlBar}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.7}>
                    <Text style={styles.iconText}>⚙️</Text>
                    <Text style={styles.iconLabel}>Impostazioni</Text>
                </TouchableOpacity>

                {remoteStream ? (
                    <TouchableOpacity style={[styles.mainBtn, styles.endCallBtn]} onPress={endCall} activeOpacity={0.8}>
                        <Text style={styles.mainBtnText}>CHIUDI CHIAMATA</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.mainBtn} onPress={() => setCallModalVisible(true)} activeOpacity={0.8}>
                        <Text style={styles.mainBtnText}>CHIAMA STAZIONE</Text>
                    </TouchableOpacity>
                )}

                <EmojiButton onSend={sendEmoji} />
            </Animated.View>

            {/* Interfaccia Modale: "Online Stations" in Italian with 2026 aesthetics */}
            <Modal visible={callModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    {/* Using Animated to animate the modal itself isn't perfectly supported in Modal without extra wrappers, but we style it warmly */}
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>STAZIONI ONLINE</Text>
                        {onlineUsers.length === 0 ? <Text style={styles.noUsersText}>Nessuna altra stazione connessa.</Text> : null}
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
                                    <TouchableOpacity style={styles.connectBtn} onPress={() => startCall(item.id)} activeOpacity={0.7}>
                                        <Text style={styles.connectBtnText}>CHIAMA</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCallModalVisible(false)} activeOpacity={0.6}>
                            <Text style={styles.cancelBtnText}>ANNULLA</Text>
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

// Fluid spring-like floating emoji animation
function FloatingEmoji({ emoji }) {
    const animValue = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        RNAnimated.spring(animValue, {
            toValue: 1,
            friction: 4,
            tension: 20,
            useNativeDriver: true,
        }).start();
    }, []);

    const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [50, -250] // Floats higher and bouncier
    });

    const opacity = animValue.interpolate({
        inputRange: [0, 0.8, 1],
        outputRange: [0, 1, 0] // Fades in then out
    });

    const scale = animValue.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0, 1.5, 1, 0.5] // Pops in, normalizes, shrinks out
    });

    return (
        <RNAnimated.Text style={[styles.emoji, { transform: [{ translateY }, { scale }], opacity }]}>
            {emoji}
        </RNAnimated.Text>
    );
}

function EmojiButton({ onSend }) {
    const [text, setText] = useState('');

    return (
        <View style={styles.emojiWrapper}>
            <Text style={styles.emojiIconBtn}>😀</Text>
            <Text style={styles.iconLabel}>Invia</Text>
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
    container: { flex: 1, backgroundColor: '#F0E5D8' /* Warm Beige */ },
    remoteVideoContainer: { flex: 1, backgroundColor: '#3A4D39' /* Forest Green backing */ },
    remoteVideo: { flex: 1, width: '100%', height: '100%', position: 'absolute' },
    remoteOverlayGradient: { flex: 1, backgroundColor: 'rgba(58, 77, 57, 0.15)' /* Slight warm tint over remote video */ },

    noCallContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0E5D8' },
    logoText: { color: '#3A4D39', fontSize: 32, letterSpacing: 4, fontWeight: '700', marginBottom: 12 },
    waitingText: { color: '#739072', fontSize: 16, letterSpacing: 1, fontWeight: '500' },
    logoutBtn: { position: 'absolute', top: 60, left: 30, padding: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 20 },
    logoutText: { color: '#D85C5C', fontWeight: 'bold' },

    pipContainer: {
        position: 'absolute',
        top: 60,
        right: 30,
        width: 140,
        height: 190, // Taller, organic ratio
        borderRadius: 35, // Heavy Squircle
        overflow: 'hidden',
        backgroundColor: '#3A4D39',
        borderWidth: 4,
        borderColor: '#F7EDE2',
        shadowColor: '#3A4D39',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3,
        shadowRadius: 25,
        elevation: 8,
    },
    pipVideo: { flex: 1, width: '100%', height: '100%' },
    pipPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pipPlaceholderText: { color: '#F7EDE2', opacity: 0.6, fontSize: 12 },

    controlBar: {
        position: 'absolute',
        bottom: 45,
        alignSelf: 'center',
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.85)', // Warm white glass
        paddingVertical: 18,
        paddingHorizontal: 30,
        borderRadius: 40, // Pill shaped
        alignItems: 'center',
        shadowColor: '#DDA77B',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.9)',
    },
    iconBtn: { alignItems: 'center', paddingHorizontal: 15 },
    iconText: { fontSize: 24, marginBottom: 4 },
    iconLabel: { color: '#739072', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

    mainBtn: {
        backgroundColor: '#E78865', // Terracotta Dopaminico
        paddingVertical: 16,
        paddingHorizontal: 35,
        borderRadius: 30,
        marginHorizontal: 25,
        shadowColor: '#E78865',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 6,
    },
    endCallBtn: { backgroundColor: '#D85C5C' }, // Warm Red for hangup
    mainBtnText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1.5, fontSize: 13 },

    emojiWrapper: { alignItems: 'center', justifyContent: 'center', width: 60, height: 60 },
    emojiIconBtn: { fontSize: 28, position: 'absolute', top: 5 },
    emojiInput: { width: '100%', height: '100%', position: 'absolute', opacity: 0 }, // Invisible input captures keyboard on mobile

    modalOverlay: { flex: 1, backgroundColor: 'rgba(74, 59, 50, 0.6)', /* Espresso Blur Tint */ justifyContent: 'flex-end', alignItems: 'center' },
    modalContent: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#F7EDE2',
        paddingTop: 30,
        paddingHorizontal: 25,
        paddingBottom: 50,
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        shadowColor: '#000', shadowOffset: { height: -5, width: 0 }, shadowOpacity: 0.1, shadowRadius: 20,
    },
    modalTitle: { color: '#3A4D39', fontSize: 18, fontWeight: '700', letterSpacing: 1, marginBottom: 25, textAlign: 'center' },
    noUsersText: { color: '#739072', textAlign: 'center', marginBottom: 30, fontSize: 15 },
    userRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderColor: 'rgba(115, 144, 114, 0.2)'
    },
    userRole: { color: '#4A3B32', fontSize: 16, fontWeight: '700' },
    userName: { color: '#739072', fontSize: 13, marginTop: 4 },
    connectBtn: {
        backgroundColor: '#739072', // Sage Green
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20
    },
    connectBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    cancelBtn: { marginTop: 30, alignItems: 'center', padding: 15 },
    cancelBtnText: { color: '#E78865', letterSpacing: 1, fontSize: 14, fontWeight: '700' },

    reactionOverlay: { position: 'absolute', bottom: 150, right: 80, width: 80, height: 400 },
    emoji: { position: 'absolute', bottom: 0, fontSize: 50, alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 10 }
});
