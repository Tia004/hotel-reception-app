import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Dimensions, TextInput } from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from 'react-native-webrtc';
import io from 'socket.io-client';
import Animated, { FadeIn, FadeInUp, SlideInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MediaSettings from './MediaSettings';

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

    // Media Streams
    const [localStream, setLocalStream] = useState(null);
    const localStreamRef = useRef(null);
    const [remoteStream, setRemoteStream] = useState(null);

    // UI Visibility States
    const [profileMenuVisible, setProfileMenuVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Svegliando il server...');
    const [chatVisible, setChatVisible] = useState(false);

    // V2.1.0 Feature States
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCamMuted, setIsCamMuted] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [focusedUserId, setFocusedUserId] = useState(null); // Which user rectangle is maximized
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Remote Peer States (Sync'd from server)
    const [remoteUserData, setRemoteUserData] = useState({
        username: '',
        isMicMuted: false,
        isCamMuted: false,
        isHandRaised: false,
        isSpeaking: false, // For Gold VAD Border
        profilePic: null
    });

    // Local VAD State
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

    // Chat State
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatDraft, setChatDraft] = useState('');
    const chatScrollRef = useRef(null);

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

        // --- V2.1.0 Feature Sync ---
        s.on('media-state-change', (data) => {
            setRemoteUserData(prev => ({
                ...prev,
                isMicMuted: data.isMicMuted,
                isCamMuted: data.isCamMuted,
                profilePic: data.profilePic
            }));
        });

        s.on('hand-raise', (data) => {
            setRemoteUserData(prev => ({
                ...prev,
                isHandRaised: data.isRaised
            }));
            if (data.isRaised) {
                // Play a subtle sound or show a toast in a real app
                console.log("Remote user raised their hand!");
            }
        });

        s.on('chat-message', (data) => {
            setMessages(prev => [...prev, data]);
            setUnreadCount(prev => prev + 1);
        });
        // ---------------------------

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
            if (audioContext.current) audioContext.current.close();
        };
    }, []);

    // --- V2.1.0: Hardware Mute & Voice Activity Detection (VAD) ---
    const audioContext = useRef(null);
    const analyzer = useRef(null);
    const vadInterval = useRef(null);

    const toggleMic = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const newMuteState = !audioTrack.enabled;
                setIsMicMuted(newMuteState);

                // Broadcast change to peers
                if (socket) {
                    socket.emit('media-state-change', {
                        isMicMuted: newMuteState,
                        isCamMuted,
                        profilePic: user.profilePic || null
                    });
                }
            }
        }
    };

    const toggleCam = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const newMuteState = !videoTrack.enabled;
                setIsCamMuted(newMuteState);

                // Broadcast change to peers
                if (socket) {
                    socket.emit('media-state-change', {
                        isMicMuted,
                        isCamMuted: newMuteState,
                        profilePic: user.profilePic || null
                    });
                }
            }
        }
    };

    const toggleHandRaise = () => {
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        if (socket) {
            socket.emit('hand-raise', { isRaised: newState });
        }
    };

    const setupVAD = (stream) => {
        try {
            if (Platform.OS === 'web') {
                audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
                analyzer.current = audioContext.current.createAnalyser();
                const source = audioContext.current.createMediaStreamSource(stream);
                source.connect(analyzer.current);
                analyzer.current.fftSize = 512;

                const bufferLength = analyzer.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                vadInterval.current = setInterval(() => {
                    analyzer.current.getByteFrequencyData(dataArray);
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const average = sum / bufferLength;

                    // Threshold for speech detection
                    if (average > 15) {
                        if (!isLocalSpeaking) setIsLocalSpeaking(true);
                    } else {
                        if (isLocalSpeaking) setIsLocalSpeaking(false);
                    }
                }, 100);
            }
        } catch (e) {
            console.log("VAD not supported on this platform/browser.");
        }
    };
    // -------------------------------------------------------------

    const sendChatMessage = () => {
        if (!chatDraft.trim() || !socket) return;
        const msg = {
            id: Date.now().toString(),
            sender: user.username,
            text: chatDraft.trim(),
            color: null, // Future: allow colored usernames
            timestamp: Date.now()
        };
        socket.emit('chat-message', msg);
        // Also add locally (the server will re-broadcast to others but we append immediately)
        setMessages(prev => [...prev, msg]);
        setChatDraft('');
    };

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

    // --- UI Render ---
    return (
        <View style={styles.container}>
            {/* Lobby UI */}
            {!currentRoom && (
                <>
                    <AmbientGlow color="#1e1836" size={400} top={50} left={-80} delay={0} />
                    <AmbientGlow color="#3a2e1d" size={300} top={height * 0.4} left={width * 0.6} delay={2000} />
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

                    {/* Top Right Profile Menu (Lobby Only) */}
                    <View style={styles.profileContainer}>
                        <TouchableOpacity onPress={() => setProfileMenuVisible(!profileMenuVisible)} style={styles.profileAvatar} activeOpacity={0.8}>
                            <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.profileAvatarGradient}>
                                <Text style={styles.profileAvatarText}>{user.username.charAt(0).toUpperCase()}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                        {profileMenuVisible && (
                            <Animated.View entering={FadeInUp.duration(200)} style={styles.profileDropdown}>
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); setSettingsVisible(true); }}>
                                    <Text style={styles.dropdownItemText}>⚙️ Impostazioni Utente</Text>
                                </TouchableOpacity>
                                <View style={styles.dropdownDivider} />
                                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setProfileMenuVisible(false); onLogout(); }}>
                                    <Text style={styles.dropdownItemTextLogout}>🚪 Esci</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </View>
                </>
            )}

            {/* --- V2.1.0 Discord In-Call UI --- */}
            {currentRoom && (
                <View style={styles.callLayout}>

                    {/* Main Video Area */}
                    <View style={[styles.mainVideoArea, chatVisible && styles.mainVideoAreaWithChat]}>

                        {/* Top Bar (Fullscreen, PiP, Room Code) */}
                        <View style={styles.topCallBar}>
                            <View style={styles.roomCodeBadge}>
                                <Text style={styles.roomCodeText}>Stanza: {currentRoom}</Text>
                            </View>
                            <View style={styles.topRightControls}>
                                <TouchableOpacity onPress={() => setIsFullscreen(!isFullscreen)} style={styles.topIconBtn}>
                                    <DiscordIcon icon={isFullscreen ? "⛶" : "🔲"} size={18} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Video Grid / Focus Mode */}
                        <View style={styles.gridContainer}>
                            {focusedUserId ? (
                                /* Focus Mode */
                                <View style={styles.focusLayout}>
                                    <View style={styles.focusedVideoWrapper}>
                                        {focusedUserId === 'local' ? (
                                            <ParticipantVideo
                                                stream={localStream} isLocal={true} username={user.username} isFocused={true}
                                                isMicMuted={isMicMuted} isCamMuted={isCamMuted} profilePic={user?.profilePic}
                                                isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised}
                                                onPress={() => setFocusedUserId(null)}
                                            />
                                        ) : (
                                            <ParticipantVideo
                                                stream={remoteStream} isLocal={false} username={remoteUserData.username} isFocused={true}
                                                isMicMuted={remoteUserData.isMicMuted} isCamMuted={remoteUserData.isCamMuted} profilePic={remoteUserData.profilePic}
                                                isSpeaking={remoteUserData.isSpeaking} isHandRaised={remoteUserData.isHandRaised}
                                                onPress={() => setFocusedUserId(null)}
                                            />
                                        )}
                                    </View>

                                    {/* Sidebar for non-focused users */}
                                    <View style={styles.sidebarVideos}>
                                        {focusedUserId !== 'local' && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={localStream} isLocal={true} username={user.username} isFocused={false}
                                                    isMicMuted={isMicMuted} isCamMuted={isCamMuted} profilePic={user?.profilePic}
                                                    isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised}
                                                    onPress={() => setFocusedUserId('local')}
                                                />
                                            </View>
                                        )}
                                        {focusedUserId !== 'remote' && remoteStream && (
                                            <View style={styles.sidebarVideoWrapper}>
                                                <ParticipantVideo
                                                    stream={remoteStream} isLocal={false} username={remoteUserData.username} isFocused={false}
                                                    isMicMuted={remoteUserData.isMicMuted} isCamMuted={remoteUserData.isCamMuted} profilePic={remoteUserData.profilePic}
                                                    isSpeaking={remoteUserData.isSpeaking} isHandRaised={remoteUserData.isHandRaised}
                                                    onPress={() => setFocusedUserId('remote')}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                /* Grid Mode */
                                <View style={styles.gridLayout}>
                                    <View style={styles.gridVideoWrapper}>
                                        <ParticipantVideo
                                            stream={localStream} isLocal={true} username={user.username} isFocused={false}
                                            isMicMuted={isMicMuted} isCamMuted={isCamMuted} profilePic={user?.profilePic}
                                            isSpeaking={isLocalSpeaking} isHandRaised={isHandRaised}
                                            onPress={() => setFocusedUserId('local')}
                                        />
                                    </View>
                                    {remoteStream && (
                                        <View style={styles.gridVideoWrapper}>
                                            <ParticipantVideo
                                                stream={remoteStream} isLocal={false} username={remoteUserData.username} isFocused={false}
                                                isMicMuted={remoteUserData.isMicMuted} isCamMuted={remoteUserData.isCamMuted} profilePic={remoteUserData.profilePic}
                                                isSpeaking={remoteUserData.isSpeaking} isHandRaised={remoteUserData.isHandRaised}
                                                onPress={() => setFocusedUserId('remote')}
                                            />
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Discord-Style Icon Control Bar */}
                        <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.controlBarWrapper}>
                            <View style={styles.discordControlBar}>

                                {/* Mic Toggle + Dropdown Arrow */}
                                <View style={styles.splitBtnContainer}>
                                    <TouchableOpacity style={[styles.discordIconBtn, isMicMuted && styles.btnMuted]} onPress={toggleMic} activeOpacity={0.8}>
                                        <DiscordIcon icon={isMicMuted ? "🔇" : "🎙️"} size={22} color={isMicMuted ? "#FF4B4B" : "#FFF"} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.splitArrowBtn} onPress={() => setSettingsVisible(true)}>
                                        <DiscordIcon icon="▼" size={10} color="#AAA" />
                                    </TouchableOpacity>
                                </View>

                                {/* Camera Toggle */}
                                <TouchableOpacity style={[styles.discordIconBtn, isCamMuted && styles.btnMuted]} onPress={toggleCam} activeOpacity={0.8}>
                                    <DiscordIcon icon={isCamMuted ? "📸" : "📹"} size={22} color={isCamMuted ? "#FF4B4B" : "#FFF"} />
                                </TouchableOpacity>

                                {/* Hand Raise */}
                                <TouchableOpacity style={[styles.discordIconBtn, isHandRaised && styles.btnActive]} onPress={toggleHandRaise} activeOpacity={0.8}>
                                    <DiscordIcon icon="✋" size={22} color={isHandRaised ? "#D4AF37" : "#FFF"} />
                                </TouchableOpacity>

                                {/* Settings (MediaSettings acts as Profile Settings too now) */}
                                <TouchableOpacity style={styles.discordIconBtn} onPress={() => setSettingsVisible(true)} activeOpacity={0.8}>
                                    <DiscordIcon icon="⚙️" size={22} />
                                </TouchableOpacity>

                                {/* End Call (Red Phone) */}
                                <TouchableOpacity style={[styles.discordIconBtn, styles.endCallBtn]} onPress={leaveRoom} activeOpacity={0.8}>
                                    <DiscordIcon icon="📞" size={22} />
                                </TouchableOpacity>
                            </View>

                            {/* Right side floating Chat Toggle */}
                            <TouchableOpacity
                                style={[styles.chatToggleBtn, chatVisible && styles.chatToggleActive]}
                                onPress={() => { setChatVisible(!chatVisible); setUnreadCount(0); }}
                            >
                                <DiscordIcon icon="💬" size={22} color={chatVisible ? "#D4AF37" : "#FFF"} />
                                {unreadCount > 0 && !chatVisible && (
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadText}>{unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    {/* Chat Side Panel View (Placeholder for ChatPanel.js logic later) */}
                    {chatVisible && (
                        <Animated.View entering={FadeIn.duration(200)} style={styles.chatSidePanel}>
                            <View style={styles.chatHeader}>
                                <Text style={styles.chatTitle}>Chat della Stanza</Text>
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
                                        <Text style={[styles.chatSender, m.color ? { color: m.color } : {}]}>
                                            {m.sender}{': '}
                                        </Text>
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
                        </Animated.View>
                    )}
                </View>
            )}

            {/* Impostazioni Modale */}
            <MediaSettings
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                onUpdateDevices={updateMediaDevices}
                user={user} // Pass user to allow profile pic updates
            />
        </View>
    );
}

// --- V2.1.0 Helper Components ---
const DiscordIcon = ({ icon, color = "#FFF", size = 20 }) => (
    <Text style={{ color, fontSize: size }}>{icon}</Text>
);

const ParticipantVideo = ({
    stream, isLocal, username, isFocused, onPress,
    isMicMuted, isCamMuted, profilePic, isSpeaking, isHandRaised
}) => {
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
                    streamURL={Platform.OS === 'web' ? stream : stream.toURL()}
                    style={styles.participantVideo}
                    objectFit="cover"
                    mirror={isLocal}
                />
            ) : (
                <View style={styles.avatarFallback}>
                    {profilePic ? (
                        <View style={styles.avatarImagePlaceholder}><Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text></View>
                    ) : (
                        <View style={styles.avatarImagePlaceholder}><Text style={styles.avatarText}>{username ? username.charAt(0).toUpperCase() : '?'}</Text></View>
                    )}
                </View>
            )}

            {/* Mic Overlay if muted */}
            {isMicMuted && (
                <View style={styles.mutedBadge}>
                    <DiscordIcon icon="🔇" size={14} color="#FF4B4B" />
                </View>
            )}

            {/* Hand Raised Overlay */}
            {isHandRaised && (
                <View style={styles.handRaisedBadge}>
                    <DiscordIcon icon="✋" size={18} />
                </View>
            )}

            <View style={styles.nameBadge}>
                <Text style={styles.nameBadgeText}>{username || 'Guest'}{isLocal ? " (Tu)" : ""}</Text>
            </View>
        </TouchableOpacity>
    );
};
// ----------------------------------

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

    /* --- V2.1.0 Discord In-Call UI --- */
    callLayout: { flex: 1, flexDirection: 'row', backgroundColor: '#050505' },
    mainVideoArea: { flex: 1, position: 'relative' },
    mainVideoAreaWithChat: { flex: 0.7 }, // Shrink when chat is open

    topCallBar: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 50 },
    roomCodeBadge: { backgroundColor: 'rgba(212, 175, 55, 0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.5)' },
    roomCodeText: { color: '#D4AF37', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
    topRightControls: { flexDirection: 'row', alignItems: 'center' },
    topIconBtn: { width: 40, height: 40, backgroundColor: 'rgba(20,20,25,0.7)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

    gridContainer: { flex: 1, padding: 20, paddingTop: 80, paddingBottom: 100 },

    // Grid Mode
    gridLayout: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 20 },
    gridVideoWrapper: { flex: 1, minWidth: 300, maxWidth: '50%', aspectRatio: 16 / 9, borderRadius: 15, overflow: 'hidden', backgroundColor: '#111' },

    // Focus Mode
    focusLayout: { flex: 1, flexDirection: 'column' },
    focusedVideoWrapper: { flex: 1, borderRadius: 15, overflow: 'hidden', backgroundColor: '#111', marginBottom: 20 },
    sidebarVideos: { height: 120, flexDirection: 'row', justifyContent: 'flex-start', gap: 15 },
    sidebarVideoWrapper: { width: 200, height: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: '#111' },

    // Participant Video Component Ints
    participantContainer: { flex: 1, width: '100%', height: '100%', position: 'relative', borderWidth: 2, borderColor: 'transparent' },
    focusedParticipant: {}, // Base styles apply
    gridParticipant: {}, // Base styles apply
    speakingBorder: { borderColor: '#D4AF37', shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 15, elevation: 10 },

    participantVideo: { flex: 1, width: '100%', height: '100%', backgroundColor: '#000' },

    avatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1D' },
    avatarImagePlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(212, 175, 55, 0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(212, 175, 55, 0.5)' },
    avatarText: { color: '#D4AF37', fontSize: 36, fontWeight: '700' },

    mutedBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', padding: 5, borderWidth: 1, borderColor: 'rgba(255,75,75,0.3)' },
    handRaisedBadge: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(212, 175, 55, 0.2)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37', shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10 },
    nameBadge: { position: 'absolute', bottom: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    nameBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '600', letterSpacing: 1 },

    // Control Bar
    controlBarWrapper: { position: 'absolute', bottom: 30, width: '100%', alignItems: 'center', zIndex: 100 },
    discordControlBar: { flexDirection: 'row', backgroundColor: 'rgba(25, 25, 30, 0.95)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, alignItems: 'center', gap: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.8, shadowRadius: 30 },
    discordIconBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    btnMuted: { backgroundColor: 'rgba(255,75,75,0.15)', borderColor: 'rgba(255,75,75,0.5)', borderWidth: 1 },
    btnActive: { backgroundColor: 'rgba(212, 175, 55, 0.2)', borderColor: '#D4AF37', borderWidth: 1 },
    endCallBtn: { backgroundColor: '#FF4B4B', marginLeft: 15 },

    splitBtnContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 25, overflow: 'hidden' },
    splitArrowBtn: { width: 25, height: 50, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)' },

    chatToggleBtn: { position: 'absolute', right: 30, width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(20,20,25,0.9)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    chatToggleActive: { backgroundColor: 'rgba(212, 175, 55, 0.2)', borderColor: '#D4AF37' },
    unreadBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF4B4B', minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
    unreadText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

    // Side Chat Panel Placeholder
    chatSidePanel: { flex: 0.3, backgroundColor: '#111', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)' },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    chatTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
    chatMessagesArea: { flex: 1, padding: 15 },
    chatMessageRow: { marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap' },
    chatSender: { color: '#D4AF37', fontWeight: 'bold' },
    chatText: { color: 'rgba(255,255,255,0.8)' },
    chatInputWrapper: { padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center' },
    chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 10, color: '#FFF' },
    chatSendBtn: { marginLeft: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(212, 175, 55, 0.2)', justifyContent: 'center', alignItems: 'center' },
    noMessagesText: { color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 40, fontStyle: 'italic', fontSize: 13 },
});

