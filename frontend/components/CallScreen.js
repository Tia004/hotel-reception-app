import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Dimensions, TextInput, ScrollView, Modal } from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';
import io from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import MediaSettings from './MediaSettings';

const { width, height } = Dimensions.get('window');
const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

// --- Helper Components ---
const DiscordIcon = ({ icon, color = '#FFF', size = 20 }) => (
    <Text style={{ color, fontSize: size }}>{icon}</Text>
);

const ParticipantVideo = ({ stream, isLocal, username, isFocused, onPress, isMicMuted, isCamMuted, profilePic, isSpeaking, isHandRaised }) => {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[
                styles.participantContainer,
                isFocused ? styles.focusedParticipant : styles.gridParticipant,
                isSpeaking && styles.speakingBorder
            ]}
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
                    <View style={styles.avatarImagePlaceholder}>
                        <Text style={styles.avatarText}>{username ? username.charAt(0).toUpperCase() : '?'}</Text>
                    </View>
                </View>
            )}

            {isMicMuted && (
                <View style={styles.mutedBadge}>
                    <DiscordIcon icon="🔇" size={14} color="#FF4B4B" />
                </View>
            )}

            {isHandRaised && (
                <View style={styles.handRaisedBadge}>
                    <DiscordIcon icon="✋" size={18} />
                </View>
            )}

            <View style={styles.nameBadge}>
                <Text style={styles.nameBadgeText}>{username || 'Guest'}{isLocal ? ' (Tu)' : ''}</Text>
            </View>
        </TouchableOpacity>
    );
};

export default function CallScreen({ user, onLogout }) {
    const [socket, setSocket] = useState(null);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const localStreamRef = useRef(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [profileMenuVisible, setProfileMenuVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Connessione...');
    const [chatVisible, setChatVisible] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCamMuted, setIsCamMuted] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [focusedUserId, setFocusedUserId] = useState(null);
    const [remoteUserData, setRemoteUserData] = useState({ username: '', isMicMuted: false, isCamMuted: false, isHandRaised: false, isSpeaking: false });
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatDraft, setChatDraft] = useState('');
    const chatScrollRef = useRef(null);
    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const currentPeerId = useRef(null);
    const pendingCandidates = useRef([]);
    const audioContext = useRef(null);
    const vadInterval = useRef(null);

    useEffect(() => {
        fetch(`${SIGNALING_URL}/ping`)
            .then(() => setConnectionStatus('Connesso! 🟢'))
            .catch(() => setConnectionStatus('Errore Server 🔴'));

        const s = io(SIGNALING_URL);
        setSocket(s);

        s.on('connect', () => {
            setConnectionStatus('Connesso! 🟢');
            s.emit('join', user);
        });

        s.on('connect_error', (err) => {
            setConnectionStatus(`Errore: ${err.message}`);
        });

        s.on('disconnect', (reason) => {
            setConnectionStatus(`Disconnesso`);
        });

        s.on('force-disconnect', (data) => {
            alert(`Disconnesso: ${data.reason}`);
            s.disconnect();
            onLogout();
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

        s.on('chat-message', (data) => {
            setMessages(prev => [...prev, data]);
            setUnreadCount(prev => prev + 1);
        });

        s.on('rooms-update', (rooms) => {
            setAvailableRooms(rooms);
        });

        s.on('room-created', ({ roomId }) => {
            setCurrentRoom(roomId);
        });

        s.on('room-joined', async ({ roomId, peers }) => {
            setCurrentRoom(roomId);
            const creatorId = peers.find(id => id !== s.id);
            if (creatorId) {
                startCall(creatorId, s);
            }
        });

        s.on('room-error', ({ message }) => {
            alert(`Errore Stanza: ${message}`);
        });

        s.on('user-joined-room', ({ socketId, username }) => {
            setRemoteUserData(prev => ({ ...prev, username }));
        });

        s.on('user-left-room', () => {
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
            if (peerConnection.current) {
                if (peerConnection.current.remoteDescription) {
                    try {
                        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) {
                        console.error('Error adding ice candidate', e);
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
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (vadInterval.current) clearInterval(vadInterval.current);
            if (audioContext.current) audioContext.current.close().catch(() => { });
        };
    }, []);

    const processPendingCandidates = () => {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
            pendingCandidates.current.forEach(async (candidate) => {
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding queued candidate', e);
                }
            });
            pendingCandidates.current = [];
        }
    };

    const startLocalStream = async (videoDeviceId = null, audioDeviceId = null) => {
        try {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }
            const constraints = {
                audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
                video: videoDeviceId ? { deviceId: videoDeviceId } : true,
            };
            const stream = await mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            localStreamRef.current = stream;
            if (peerConnection.current) {
                const senders = peerConnection.current.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) sender.replaceTrack(track);
                    else peerConnection.current.addTrack(track, stream);
                });
            }
            setupVAD(stream);
        } catch (e) {
            console.warn('Media access failed (expected on HTTP):', e.message);
        }
    };

    const setupVAD = (stream) => {
        try {
            if (Platform.OS === 'web' && typeof AudioContext !== 'undefined') {
                audioContext.current = new AudioContext();
                const analyserNode = audioContext.current.createAnalyser();
                const source = audioContext.current.createMediaStreamSource(stream);
                source.connect(analyserNode);
                analyserNode.fftSize = 512;
                const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
                vadInterval.current = setInterval(() => {
                    analyserNode.getByteFrequencyData(dataArray);
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    setIsLocalSpeaking(avg > 15);
                }, 150);
            }
        } catch (e) {
            console.log('VAD not available');
        }
    };

    const createPeerConnection = (targetId, currentSocket) => {
        const pc = new RTCPeerConnection(configuration);
        const dc = pc.createDataChannel('chat');
        dataChannel.current = dc;
        pc.ondatachannel = (event) => { dataChannel.current = event.channel; };
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                currentSocket.emit('ice-candidate', { target: targetId, candidate: event.candidate });
            }
        };
        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            }
        };
        // Legacy addStream support
        pc.onaddstream = (event) => { setRemoteStream(event.stream); };
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }
        peerConnection.current = pc;
    };

    const createRoom = () => {
        if (socket) socket.emit('create-room');
    };

    const joinRoom = (roomId) => {
        if (socket) socket.emit('join-room', { roomId });
    };

    const startCall = async (targetId, currentSocket) => {
        createPeerConnection(targetId, currentSocket);
        currentPeerId.current = targetId;
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        currentSocket.emit('offer', { target: targetId, caller: currentSocket.id, sdp: offer });
    };

    const leaveRoom = () => {
        if (socket) socket.emit('leave-room');
        if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
        setRemoteStream(null);
        currentPeerId.current = null;
        setCurrentRoom(null);
        setFocusedUserId(null);
    };

    const toggleMic = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                const newState = !track.enabled;
                setIsMicMuted(newState);
                if (socket) socket.emit('media-state-change', { isMicMuted: newState, isCamMuted });
            }
        }
    };

    const toggleCam = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                const newState = !track.enabled;
                setIsCamMuted(newState);
                if (socket) socket.emit('media-state-change', { isMicMuted, isCamMuted: newState });
            }
        }
    };

    const toggleHandRaise = () => {
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        if (socket) socket.emit('hand-raise', { isRaised: newState });
    };

    const sendChatMessage = () => {
        if (!chatDraft.trim() || !socket) return;
        const msg = { sender: user.username, text: chatDraft.trim(), timestamp: Date.now() };
        socket.emit('chat-message', msg);
        setMessages(prev => [...prev, msg]);
        setChatDraft('');
    };

    const updateMediaDevices = ({ videoDeviceId, audioDeviceId }) => {
        startLocalStream(videoDeviceId, audioDeviceId);
    };

    // --- Render ---
    return (
        <View style={styles.container}>
            {/* === LOBBY === */}
            {!currentRoom && (
                <View style={styles.lobbyContainer}>
                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <Text style={styles.logoText}>RECEPTION</Text>
                        <Text style={styles.waitingText}>STANZE VIRTUALI</Text>
                        <Text style={styles.diagnosticText}>Server: {SIGNALING_URL}</Text>
                        <Text style={[styles.diagnosticText, {
                            color: connectionStatus.includes('Errore') ? '#FF4B4B'
                                : connectionStatus.includes('Connesso') ? '#4BFF4B'
                                    : '#D4AF37'
                        }]}>
                            {connectionStatus}
                        </Text>
                    </View>

                    {/* Create Room */}
                    <TouchableOpacity style={styles.createRoomBtn} onPress={createRoom} activeOpacity={0.8}>
                        <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.createBtnGradient}>
                            <Text style={styles.createBtnText}>CREA STANZA ➔</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Available Rooms */}
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
                                            <Text style={styles.roomCreator}>@{item.creatorName}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.joinBtn} onPress={() => joinRoom(item.id)} activeOpacity={0.8}>
                                            <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']} style={styles.connectBtnGradient}>
                                                <Text style={styles.connectBtnText}>ENTRA</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        )}
                    </View>

                    {/* Profile button top-right */}
                    <View style={styles.profileContainer}>
                        <TouchableOpacity
                            onPress={() => setProfileMenuVisible(!profileMenuVisible)}
                            style={styles.profileAvatar}
                            activeOpacity={0.8}
                        >
                            <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.profileAvatarGradient}>
                                <Text style={styles.profileAvatarText}>{user.username.charAt(0).toUpperCase()}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {profileMenuVisible && (
                            <View style={styles.profileDropdown}>
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); setSettingsVisible(true); }}>
                                    <Text style={styles.dropdownItemText}>⚙️  Impostazioni Utente</Text>
                                </TouchableOpacity>
                                <View style={styles.dropdownDivider} />
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); onLogout(); }}>
                                    <Text style={styles.dropdownItemTextLogout}>🚪  Esci</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* === IN-CALL UI === */}
            {currentRoom && (
                <View style={styles.callLayout}>

                    {/* Main video area */}
                    <View style={[styles.mainVideoArea, chatVisible && styles.mainVideoAreaWithChat]}>

                        {/* Top bar */}
                        <View style={styles.topCallBar}>
                            <View style={styles.roomCodeBadge}>
                                <Text style={styles.roomCodeText}>Stanza: {currentRoom}</Text>
                            </View>
                            <TouchableOpacity onPress={leaveRoom} style={styles.leaveTopBtn}>
                                <Text style={styles.leaveTopBtnText}>✕ Abbandona</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Video grid */}
                        <View style={styles.gridContainer}>
                            {focusedUserId ? (
                                <View style={styles.focusLayout}>
                                    <View style={styles.focusedVideoWrapper}>
                                        {focusedUserId === 'local' ? (
                                            <ParticipantVideo
                                                stream={localStream}
                                                isLocal={true}
                                                username={user.username}
                                                isFocused={true}
                                                isMicMuted={isMicMuted}
                                                isCamMuted={isCamMuted}
                                                isSpeaking={isLocalSpeaking}
                                                isHandRaised={isHandRaised}
                                                onPress={() => setFocusedUserId(null)}
                                            />
                                        ) : (
                                            <ParticipantVideo
                                                stream={remoteStream}
                                                isLocal={false}
                                                username={remoteUserData.username}
                                                isFocused={true}
                                                isMicMuted={remoteUserData.isMicMuted}
                                                isCamMuted={remoteUserData.isCamMuted}
                                                isSpeaking={remoteUserData.isSpeaking}
                                                isHandRaised={remoteUserData.isHandRaised}
                                                onPress={() => setFocusedUserId(null)}
                                            />
                                        )}
                                    </View>
                                    <View style={styles.sidebarVideos}>
                                        {focusedUserId !== 'local' && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={localStream}
                                                    isLocal={true}
                                                    username={user.username}
                                                    isFocused={false}
                                                    isMicMuted={isMicMuted}
                                                    isCamMuted={isCamMuted}
                                                    isSpeaking={isLocalSpeaking}
                                                    isHandRaised={isHandRaised}
                                                    onPress={() => setFocusedUserId('local')}
                                                />
                                            </View>
                                        )}
                                        {focusedUserId !== 'remote' && remoteStream && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={remoteStream}
                                                    isLocal={false}
                                                    username={remoteUserData.username}
                                                    isFocused={false}
                                                    isMicMuted={remoteUserData.isMicMuted}
                                                    isCamMuted={remoteUserData.isCamMuted}
                                                    isSpeaking={remoteUserData.isSpeaking}
                                                    isHandRaised={remoteUserData.isHandRaised}
                                                    onPress={() => setFocusedUserId('remote')}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.gridLayout}>
                                    <View style={styles.gridVideoWrapper}>
                                        <ParticipantVideo
                                            stream={localStream}
                                            isLocal={true}
                                            username={user.username}
                                            isFocused={false}
                                            isMicMuted={isMicMuted}
                                            isCamMuted={isCamMuted}
                                            isSpeaking={isLocalSpeaking}
                                            isHandRaised={isHandRaised}
                                            onPress={() => setFocusedUserId('local')}
                                        />
                                    </View>
                                    {remoteStream && (
                                        <View style={styles.gridVideoWrapper}>
                                            <ParticipantVideo
                                                stream={remoteStream}
                                                isLocal={false}
                                                username={remoteUserData.username}
                                                isFocused={false}
                                                isMicMuted={remoteUserData.isMicMuted}
                                                isCamMuted={remoteUserData.isCamMuted}
                                                isSpeaking={remoteUserData.isSpeaking}
                                                isHandRaised={remoteUserData.isHandRaised}
                                                onPress={() => setFocusedUserId('remote')}
                                            />
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Control Bar */}
                        <View style={styles.controlBarWrapper}>
                            <View style={styles.discordControlBar}>
                                {/* Mic */}
                                <View style={styles.splitBtnContainer}>
                                    <TouchableOpacity style={[styles.discordIconBtn, isMicMuted && styles.btnMuted]} onPress={toggleMic} activeOpacity={0.8}>
                                        <DiscordIcon icon={isMicMuted ? '🔇' : '🎙️'} size={22} color={isMicMuted ? '#FF4B4B' : '#FFF'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.splitArrowBtn} onPress={() => setSettingsVisible(true)}>
                                        <DiscordIcon icon="▼" size={10} color="#AAA" />
                                    </TouchableOpacity>
                                </View>

                                {/* Camera */}
                                <TouchableOpacity style={[styles.discordIconBtn, isCamMuted && styles.btnMuted]} onPress={toggleCam} activeOpacity={0.8}>
                                    <DiscordIcon icon={isCamMuted ? '📷' : '📹'} size={22} color={isCamMuted ? '#FF4B4B' : '#FFF'} />
                                </TouchableOpacity>

                                {/* Hand raise */}
                                <TouchableOpacity style={[styles.discordIconBtn, isHandRaised && styles.btnActive]} onPress={toggleHandRaise} activeOpacity={0.8}>
                                    <DiscordIcon icon="✋" size={22} color={isHandRaised ? '#D4AF37' : '#FFF'} />
                                </TouchableOpacity>

                                {/* Settings */}
                                <TouchableOpacity style={styles.discordIconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.8}>
                                    <DiscordIcon icon="⚙️" size={22} />
                                </TouchableOpacity>

                                {/* End call */}
                                <TouchableOpacity style={[styles.discordIconBtn, styles.endCallBtn]} onPress={leaveRoom} activeOpacity={0.8}>
                                    <DiscordIcon icon="📞" size={22} />
                                </TouchableOpacity>
                            </View>

                            {/* Chat toggle */}
                            <TouchableOpacity
                                style={[styles.chatToggleBtn, chatVisible && styles.chatToggleActive]}
                                onPress={() => { setChatVisible(!chatVisible); setUnreadCount(0); }}
                            >
                                <DiscordIcon icon="💬" size={22} color={chatVisible ? '#D4AF37' : '#FFF'} />
                                {unreadCount > 0 && !chatVisible && (
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadText}>{unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Chat panel */}
                    {chatVisible && (
                        <View style={styles.chatSidePanel}>
                            <View style={styles.chatHeader}>
                                <Text style={styles.chatTitle}>Chat</Text>
                                <TouchableOpacity onPress={() => setChatVisible(false)}>
                                    <DiscordIcon icon="✖" size={16} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                ref={chatScrollRef}
                                style={styles.chatMessagesArea}
                                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
                                showsVerticalScrollIndicator={false}
                            >
                                {messages.length === 0 && (
                                    <Text style={styles.noMessagesText}>Inizia la conversazione 👋</Text>
                                )}
                                {messages.map((m, i) => (
                                    <View key={i} style={styles.chatMessageRow}>
                                        <Text style={styles.chatSender}>{m.sender}: </Text>
                                        <Text style={styles.chatText}>{m.text}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                            <View style={styles.chatInputWrapper}>
                                <TextInput
                                    style={styles.chatInput}
                                    placeholder="Scrivi un messaggio..."
                                    placeholderTextColor="#666"
                                    value={chatDraft}
                                    onChangeText={setChatDraft}
                                    onSubmitEditing={sendChatMessage}
                                    returnKeyType="send"
                                    blurOnSubmit={false}
                                />
                                <TouchableOpacity style={styles.chatSendBtn} onPress={sendChatMessage}>
                                    <DiscordIcon icon="➤" size={14} color="#D4AF37" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* Settings Modal */}
            <MediaSettings
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                onUpdateDevices={updateMediaDevices}
                user={user}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0A0C' },

    // --- Lobby ---
    lobbyContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: height * 0.12 },
    headerContainer: { alignItems: 'center', marginBottom: 40 },
    logoText: { color: '#FFFFFF', fontSize: 32, letterSpacing: 6, fontWeight: '200', textAlign: 'center' },
    waitingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 4, marginTop: 10 },
    diagnosticText: { color: 'rgba(212,175,55,0.7)', fontSize: 11, marginTop: 6 },

    createRoomBtn: { width: 260, height: 58, borderRadius: 29, overflow: 'hidden', marginBottom: 40, shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18 },
    createBtnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    createBtnText: { color: '#000', fontWeight: '700', letterSpacing: 3, fontSize: 14 },

    roomsListContainer: { width: '90%', maxWidth: 480, backgroundColor: 'rgba(20,20,25,0.85)', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    roomsListTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 3, fontWeight: '600', marginBottom: 18, textAlign: 'center' },
    noRoomsText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: 13, fontStyle: 'italic', paddingVertical: 20 },
    roomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    roomName: { color: '#D4AF37', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
    roomCreator: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 3 },
    joinBtn: { width: 85, height: 38, borderRadius: 19, overflow: 'hidden' },
    connectBtnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    connectBtnText: { color: '#FFF', fontSize: 11, fontWeight: '600', letterSpacing: 1 },

    profileContainer: { position: 'absolute', top: Platform.OS === 'web' ? 24 : 50, right: 24, zIndex: 100, alignItems: 'flex-end' },
    profileAvatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
    profileAvatarGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    profileAvatarText: { color: '#000', fontSize: 20, fontWeight: '700' },
    profileDropdown: { marginTop: 10, width: 210, backgroundColor: 'rgba(22,22,28,0.97)', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { height: 10, width: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
    dropdownItem: { paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10 },
    dropdownItemText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
    dropdownItemTextLogout: { color: '#FF4B4B', fontSize: 14, fontWeight: '600' },
    dropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 4 },

    // --- In-Call ---
    callLayout: { flex: 1, flexDirection: 'row', backgroundColor: '#050505' },
    mainVideoArea: { flex: 1, position: 'relative' },
    mainVideoAreaWithChat: { flex: 0.68 },

    topCallBar: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 50 },
    roomCodeBadge: { backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
    roomCodeText: { color: '#D4AF37', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
    leaveTopBtn: { backgroundColor: 'rgba(255,75,75,0.18)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,75,75,0.4)' },
    leaveTopBtnText: { color: '#FF4B4B', fontSize: 12, fontWeight: '700' },

    gridContainer: { flex: 1, padding: 16, paddingTop: 72, paddingBottom: 110 },
    gridLayout: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12 },
    gridVideoWrapper: { flex: 1, minWidth: 280, maxWidth: '50%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },

    focusLayout: { flex: 1, flexDirection: 'column' },
    focusedVideoWrapper: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#111', marginBottom: 12 },
    sidebarVideos: { height: 110, flexDirection: 'row', gap: 10 },
    sidebarVideoWrapper: { width: 190, height: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: '#111' },

    participantContainer: { flex: 1, width: '100%', height: '100%', position: 'relative', borderWidth: 2, borderColor: 'transparent' },
    focusedParticipant: {},
    gridParticipant: {},
    speakingBorder: { borderColor: '#D4AF37', elevation: 8 },
    participantVideo: { flex: 1, width: '100%', height: '100%' },
    avatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1D' },
    avatarImagePlaceholder: { width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(212,175,55,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(212,175,55,0.5)' },
    avatarText: { color: '#D4AF37', fontSize: 34, fontWeight: '700' },
    mutedBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.65)', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    handRaisedBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(212,175,55,0.2)', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37' },
    nameBadge: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    nameBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

    controlBarWrapper: { position: 'absolute', bottom: 24, width: '100%', alignItems: 'center', zIndex: 100 },
    discordControlBar: { flexDirection: 'row', backgroundColor: 'rgba(22,22,28,0.95)', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 30, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    discordIconBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    btnMuted: { backgroundColor: 'rgba(255,75,75,0.15)', borderColor: 'rgba(255,75,75,0.5)', borderWidth: 1 },
    btnActive: { backgroundColor: 'rgba(212,175,55,0.2)', borderColor: '#D4AF37', borderWidth: 1 },
    endCallBtn: { backgroundColor: '#FF4B4B' },
    splitBtnContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, overflow: 'hidden' },
    splitArrowBtn: { width: 22, height: 48, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)' },
    chatToggleBtn: { position: 'absolute', right: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(22,22,28,0.92)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    chatToggleActive: { backgroundColor: 'rgba(212,175,55,0.2)', borderColor: '#D4AF37' },
    unreadBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF4B4B', minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
    unreadText: { color: '#FFF', fontSize: 9, fontWeight: '800' },

    chatSidePanel: { flex: 0.32, backgroundColor: '#111', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    chatTitle: { color: '#FFF', fontSize: 15, fontWeight: '600', letterSpacing: 1 },
    chatMessagesArea: { flex: 1, padding: 14 },
    chatMessageRow: { marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap' },
    chatSender: { color: '#D4AF37', fontWeight: 'bold' },
    chatText: { color: 'rgba(255,255,255,0.82)' },
    chatInputWrapper: { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center' },
    chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, color: '#FFF' },
    chatSendBtn: { marginLeft: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(212,175,55,0.2)', justifyContent: 'center', alignItems: 'center' },
    noMessagesText: { color: 'rgba(255,255,255,0.22)', textAlign: 'center', marginTop: 38, fontStyle: 'italic', fontSize: 13 },
});
