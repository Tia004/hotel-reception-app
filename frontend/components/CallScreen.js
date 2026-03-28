import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
    Animated, Dimensions, Platform, Image, Modal, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import { RTCView } from '../utils/webrtc';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, ParticipantEvent } from 'livekit-client';

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏', '🙌', '👍'];

function FloatingEmoji({ emoji, onComplete }) {
    const yAnim = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const { width, height } = Dimensions.get('window');

    useEffect(() => {
        Animated.parallel([
            Animated.timing(yAnim, {
                toValue: -height * 0.6,
                duration: 3000,
                useNativeDriver: true
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 3000,
                useNativeDriver: true
            })
        ]).start(onComplete);
    }, []);

    const xPos = useRef(width / 2 - 20 + (Math.random() * 60 - 30)).current; // Center with slight variance

    return (
        <Animated.Text 
            style={[
                styles.floatingEmoji, 
                { 
                    position: 'absolute',
                    bottom: 120,
                    left: xPos,
                    transform: [{ translateY: yAnim }], 
                    opacity 
                }
            ]}
        >
            {emoji}
        </Animated.Text>
    );
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

const GSA_EMOJI_DATA = [
    { name: 'Smileys', emoji: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
    { name: 'Gesti', emoji: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🙏', '✍️', '💅', '💪', '🫀', '🧠', '👁️', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'] },
    { name: 'Animali', emoji: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🐊', '🦓', '🦍', '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🐃', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🕊️', '🐇', '🦝', '🦔', '🐉', '🐲', '🌵', '🌲', '🌴', '🍄', '🌊', '🌈', '⭐', '🌟', '☀️', '🌙', '⛅', '🌩️', '❄️', '🔥', '💧', '🌬️'] },
    { name: 'Cibo', emoji: ['🍎', '🍏', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥙', '🧆', '🍿', '🍱', '🍣', '🍜', '🍝', '🍛', '🥟', '🦀', '🦞', '🦐', '🦑', '🪸', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍼', '🥛', '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾'] },
    { name: 'Attività', emoji: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🥍', '🏏', '🪃', '⛳', '🪁', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🎮', '🎰', '🎲', '♟️', '🧩', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎻', '🎵', '🎶', '🎙️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎪', '🎠', '🎡', '🎢'] },
    { name: 'Viaggio', emoji: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🚲', '🛴', '🛺', '🚁', '🛸', '⛵', '🚢', '🛥️', '⛽', '🚦', '🚧', '⚓', '✈️', '🛫', '🛬', '💺', '🛰️', '🚀', '🌍', '🌎', '🌏', '🗺️', '🏔️', '⛰️', '🌋', '🏕️', '🏖️', '🏗️', '🏘️', '🏚️', '🏛️', '🏟️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏧', '🏨', '🏩', '🏪', '🏫', '🏬', '🗼', '🗽', '⛪', 'Ẩ', '🕍', '⛩️', '🕋', '🌃', '🌆', '🌇', '🌉', '🌌', '🌠'] },
    { name: 'Oggetti', emoji: ['📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📞', '☎️', '📺', '📻', '🧭', '⏱️', '⏲️', '⏰', '⌚', '🔋', '🔌', '💡', '🔦', '🕯️', '🔑', '🗝️', '🔒', '🔓', '🔨', '⚒️', '🛠️', '🔧', '🔩', '⚙️', '⚖️', '🔗', '🧲', '🪜', '🧪', '🔬', '🔭', '💉', '💊', '🩹', '📧', '📦', '📫', '📮', '✏️', '📝', '📁', '📂', '📅', '📆', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '✂️', '💰', '💳', '🪙', '📚', '📖', '🔖', '🏷️', '📰', '🗞️', '📃'] },
    { name: 'Simboli', emoji: ['✅', '❌', '⭕', '🚫', '💯', '🔔', '🔕', '📢', '📣', '🔊', '🔇', '🔈', '🔉', '🎵', '🎶', '💬', '💭', '🗨️', '🗯️', 'ℹ️', '🆕', '🆙', '🆒', '🆓', '🆖', '🆗', '🆘', '🔝', '🔛', '🔜', '🔚', '🆚', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🈷️', '🈶', '🈯', '🉑', '🈸', '🈺', '🈳', '🈻', '🚾', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔲', '🔳', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '✔️', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '🔃', '🔄'] }
];

export default function CallScreen({ 
    socket, roomId, user, onMinimize, onClose, 
    micOn, setMicOn, camOn, setCamOn, deafenOn, setDeafenOn,
    screenShareOn, setScreenShareOn, onOpenSettings
}) {
    // ── UI States ────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    // micOn, camOn, deafenOn, screenShareOn moved to props
    const [handRaised, setHandRaised] = useState(false);
    const [handsRaised, setHandsRaised] = useState({}); // identity -> boolean
    const [showReactions, setShowReactions] = useState(false);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [connectionErrors, setConnectionErrors] = useState({});
    const [showDebug, setShowDebug] = useState(false);

    // Discord UI States
    const [focusedId, setFocusedId] = useState(null);
    const [showOthers, setShowOthers] = useState(true);
    const [fullScreen, setFullScreen] = useState(false);
    
    // Device States
    const [audioInputs, setAudioInputs] = useState([]);
    const [audioOutputs, setAudioOutputs] = useState([]);
    const [videoInputs, setVideoInputs] = useState([]);
    const [showMicMenu, setShowMicMenu] = useState(false);
    const [showCamMenu, setShowCamMenu] = useState(false);
    const [selectedAudioInput, setSelectedAudioInput] = useState(null);
    const [selectedAudioOutput, setSelectedAudioOutput] = useState(null);
    const [selectedVideoInput, setSelectedVideoInput] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [activeSubMenu, setActiveSubMenu] = useState(null); // 'input', 'output', 'video'
    const [mainMenuType, setMainMenuType] = useState(null); // 'mic', 'cam'

    const micBtnRef = useRef(null);
    const camBtnRef = useRef(null);

    const getParticipantColor = (identity) => {
        const colors = [
            '#C9A84C', '#3BA55C', '#FAA61A', '#ED4245', '#EB459E', 
            '#FF73FA', '#00AFF4', '#57F287', '#FEE75C', '#95A5A6'
        ];
        let hash = 0;
        for (let i = 0; i < identity.length; i++) {
            hash = identity.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const [lkRoom, setLkRoom] = useState(null);
    const lkRoomRef = useRef(null);
    const [participants, setParticipants] = useState([]); // Array of Participant objects
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // identity -> MediaStream
    const [connecting, setConnecting] = useState(false);
    const [debugLogs, setDebugLogs] = useState([]);

    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString();
        setDebugLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
        console.log(`[LK-DEBUG] ${msg}`);
    };

    const chatScrollRef = useRef(null);
    const spinAnim = useRef(new Animated.Value(0)).current;

    const onEmojiReaction = useCallback(({ emoji }) => {
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
    }, []);

    // ── Initialization ───────────────────────────────────────────────────
    useEffect(() => {
        Animated.loop(
            Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
        ).start();
        const timer = setTimeout(() => setLoading(false), 400);
        return () => clearTimeout(timer);
    }, []);

    const lkUrl = "wss://gsa-hotels-calls-ls2c6m36.livekit.cloud";
    const API_BASE = "https://hotel-reception-app.onrender.com";

    const fetchTokenAndConnect = useCallback(async () => {
        try {
            setConnecting(true);
            addLog(`Inizio connessione a ${roomId}...`);

            // 1. Get Token from Internal Server
            addLog(`Richiesta token a ${API_BASE}...`);
            const response = await fetch(`${API_BASE}/get-livekit-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room: roomId, username: user.username })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`Server Token Error: ${response.status} ${errData.error || ''}`);
            }

            const { token } = await response.json();
            if (!token) throw new Error("Token non ricevuto dal server");
            addLog("Token ricevuto correttamente.");

            // 2. Initialize LiveKit Room
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            // 3. Event Listeners
            const updateParticipants = () => {
                if (!room) return;
                const remoteMap = room.remoteParticipants || room.participants || new Map();
                const remoteArray = Array.from(remoteMap.values());
                setParticipants([room.localParticipant, ...remoteArray]);
            };

            room.on(RoomEvent.ParticipantConnected, (p) => {
                addLog(`Partecipante connesso: ${p.identity}`);
                updateParticipants();
            });
            room.on(RoomEvent.ParticipantDisconnected, (p) => {
                addLog(`Partecipante disconnesso: ${p.identity}`);
                updateParticipants();
            });
            room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                addLog(`Traccia sottoscritta: ${track.kind} da ${participant.identity}`);
                if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
                    setRemoteStreams(prev => ({
                        ...prev,
                        [participant.identity]: track.mediaStream
                    }));
                }
            });
            
            room.on(RoomEvent.ConnectionStateChanged, (state) => {
                addLog(`Stato connessione: ${state}`);
            });

            room.on(RoomEvent.DataReceived, (payload, participant) => {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'reaction') {
                    onEmojiReaction({ emoji: data.emoji });
                } else if (data.type === 'hand-raise') {
                    setHandsRaised(prev => ({ ...prev, [participant.identity]: data.raised }));
                }
            });

            // 4. Connect
            addLog(`Connessione a LiveKit SFU (${lkUrl})...`);
            await room.connect(lkUrl, token);
            addLog(`Connesso alla stanza: ${room.name}`);

            // 5. Start Local Media
            addLog("Tentativo di attivazione Camera e Microfono...");
            try {
                await room.localParticipant.enableCameraAndMicrophone();
                addLog("Camera e Microfono attivati.");
                
                // Get the video track media stream
                const videoPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                if (videoPub && videoPub.videoTrack) {
                    addLog("Traccia video locale trovata.");
                    setLocalStream(videoPub.videoTrack.mediaStream);
                } else {
                    addLog("⚠️ ATTENZIONE: Traccia video locale non trovata dopo enable.");
                    // In some versions, it might be in videoTracks map
                    const vt = Array.from(room.localParticipant.videoTrackPublications.values()).find(p => p.source === Track.Source.Camera);
                    if (vt && vt.videoTrack) {
                        addLog("Traccia video locale trovata (fallback).");
                        setLocalStream(vt.videoTrack.mediaStream);
                    }
                }
            } catch (mediaErr) {
                addLog(`❌ Errore Media: ${mediaErr.message}`);
                console.error("Media Error:", mediaErr);
            }
            
            lkRoomRef.current = room;
            setLkRoom(room);
            updateParticipants();
            setConnecting(false);
            
            // Fetch initial devices and select currently used ones
            refreshDevices().then(() => {
                const audioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
                const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
                if (audioTrack) setSelectedAudioInput(audioTrack.getDeviceId());
                if (videoTrack) setSelectedVideoInput(videoTrack.getDeviceId());
                // Note: setSinkId for output might not be available on all browsers/LiveKit versions
                // but we can at least track what our state says
            });
        } catch (err) {
            addLog(`❌ ERRORE CRITICO: ${err.message}`);
            console.error('[LiveKit] Connection Failed:', err);
            setConnecting(false);
            setConnectionErrors({ main: err.message });
        }
    }, [roomId, user.username, lkUrl, API_BASE]);

    useEffect(() => {
        const lp = lkRoom?.localParticipant || lkRoomRef.current?.localParticipant;
        if (!lp) return;
        lp.setMicrophoneEnabled(micOn);
    }, [micOn, lkRoom]);

    useEffect(() => {
        const lp = lkRoom?.localParticipant || lkRoomRef.current?.localParticipant;
        if (!lp) return;
        lp.setCameraEnabled(camOn);
    }, [camOn, lkRoom]);

    useEffect(() => {
        const lp = lkRoom?.localParticipant || lkRoomRef.current?.localParticipant;
        if (!lp) return;
        lp.setScreenShareEnabled(screenShareOn);
    }, [screenShareOn, lkRoom]);

    useEffect(() => {
        const lp = lkRoom?.localParticipant || lkRoomRef.current?.localParticipant;
        if (!lp) return;
        
        const handleTrackUnpublished = (pub) => {
            if (pub.source === Track.Source.ScreenShare) setScreenShareOn(false);
            if (pub.source === Track.Source.ScreenShare) {
                setScreenShareOn(false);
            }
        };

        lp.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
        return () => {
            lp.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
        };
    }, [lkRoom]);

    useEffect(() => {
        if (!lkRoom) return;
        
        // Listen for device changes
        if (navigator.mediaDevices) {
            const handleDeviceChange = () => refreshDevices();
            navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
            return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        }
    }, [lkRoom]);

    useEffect(() => {
        participants.forEach(p => {
            if (p.identity === user.username) return;
            p.getTrackPublications().forEach(pub => {
                if (pub.kind === Track.Kind.Audio) {
                    if (deafenOn) pub.track?.detach();
                    else pub.track?.attach();
                }
            });
        });
    }, [deafenOn, participants]);

    useEffect(() => {
        const lp = lkRoom?.localParticipant || lkRoomRef.current?.localParticipant;
        if (!lp) return;
        lp.setScreenShareEnabled(screenShareOn, { audio: true })
            .catch(err => addLog(`❌ Errore sync Screen Share: ${err.message}`));
    }, [screenShareOn, lkRoom]);

    useEffect(() => {
        if (!socket || !roomId) return;
        fetchTokenAndConnect();

        const onEmoji = ({ emoji }) => onEmojiReaction({ emoji });
        socket.on('emoji-reaction', onEmoji);

        const handleBeforeUnload = () => {
            if (lkRoomRef.current) lkRoomRef.current.disconnect();
        };
        if (Platform.OS === 'web') {
            window.addEventListener('beforeunload', handleBeforeUnload);
        }

        return () => {
            if (Platform.OS === 'web') {
                window.removeEventListener('beforeunload', handleBeforeUnload);
            }
            if (lkRoomRef.current) {
                lkRoomRef.current.disconnect();
                lkRoomRef.current = null;
                setLkRoom(null);
            }
            socket.off('emoji-reaction', onEmoji);
        };
    }, [roomId, socket, fetchTokenAndConnect]); // Loop broken: lkRoom removed from deps

    // ── Actions ──────────────────────────────────────────────────────────
    const leaveCall = useCallback(async () => {
        addLog("ABBANDONO CHIAMATA...");
        const room = lkRoomRef.current || lkRoom;
        if (room) {
            try {
                if (handRaised) {
                    const data = JSON.stringify({ type: 'hand-raise', raised: false });
                    room.localParticipant.publishData(new TextEncoder().encode(data));
                }
                await room.disconnect();
            } catch (e) {}
            lkRoomRef.current = null;
            setLkRoom(null);
        }
        setLocalStream(null);
        setRemoteStreams({});
        if (onClose) onClose();
        else onMinimize();
    }, [lkRoom, handRaised, onMinimize, onClose]);

    const toggleMic = () => {
        setMicOn(!micOn);
    };

    const toggleCam = () => {
        setCamOn(!camOn);
    };

    const toggleDeafen = () => {
        setDeafenOn(!deafenOn);
    };

    const sendReaction = (emoji) => {
        setShowReactions(false);
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
        
        const room = lkRoomRef.current || lkRoom;
        if (room?.localParticipant) {
            const data = JSON.stringify({ type: 'reaction', emoji });
            room.localParticipant.publishData(new TextEncoder().encode(data));
        }
    };

    const toggleFullScreen = () => {
        setFullScreen(!fullScreen);
    };

    const toggleScreenShare = () => {
        if (screenShareOn) {
            setScreenShareOn(false);
        } else {
            setScreenShareOn(true);
        }
    };

    const toggleHandRaise = () => {
        const next = !handRaised;
        setHandRaised(next);
        const room = lkRoomRef.current || lkRoom;
        if (room?.localParticipant) {
            const data = JSON.stringify({ type: 'hand-raise', raised: next });
            room.localParticipant.publishData(new TextEncoder().encode(data));
            setHandsRaised(prev => ({ ...prev, [room.localParticipant.identity]: next }));
        }
    };

    const refreshDevices = async () => {
        try {
            if (!navigator.mediaDevices?.enumerateDevices) {
                addLog("⚠️ enumerateDevices non supportato");
                return;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
            setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
            setVideoInputs(devices.filter(d => d.kind === 'videoinput'));
            addLog(`Dispositivi aggiornati: ${devices.length}`);
        } catch (err) {
            addLog(`Errore nel recupero dispositivi: ${err.message}`);
        }
    };

    const switchDevice = async (kind, deviceId) => {
        const room = lkRoomRef.current || lkRoom;
        if (!room) return;
        try {
            addLog(`Switching ${kind} to ${deviceId}...`);
            await room.switchActiveDevice(kind, deviceId);
            if (kind === 'audioinput') setSelectedAudioInput(deviceId);
            if (kind === 'audiooutput') setSelectedAudioOutput(deviceId);
            if (kind === 'videoinput') setSelectedVideoInput(deviceId);
            setShowMicMenu(false);
            setShowCamMenu(false);
        } catch (err) {
            addLog(`❌ Errore switch dispositivo: ${err.message}`);
        }
    };




    // ── Helper ───────────────────────────────────────────────────────────
    const getParticipantStream = (p) => {
        if (p instanceof LocalParticipant) return localStream;
        return remoteStreams[p.identity];
    };

    // ── Render Parts ─────────────────────────────────────────────────────
    const renderTile = (participant, source = Track.Source.Camera, size = 'grid') => {
        if (!participant) return null;
        const isLocal = participant instanceof LocalParticipant;
        const isScreen = source === Track.Source.ScreenShare;
        const tileId = `${participant.identity}-${source}`;
        const isFocused = tileId === focusedId;
        
        const pub = participant.getTrackPublication(source);
        const micPub = participant.getTrackPublication(Track.Source.Microphone);
        
        const stream = pub?.videoTrack?.mediaStream || (isLocal && !isScreen && localStream);
        const hasVideo = isLocal ? (isScreen ? screenShareOn : camOn) : (pub?.isSubscribed && !pub?.isMuted);
        const isMuted = isLocal ? !micOn : (micPub?.isMuted || !micPub?.isSubscribed);
        
        const bgColor = isScreen ? '#000' : getParticipantColor(participant.identity);

        return (
            <TouchableOpacity 
                key={tileId} 
                activeOpacity={0.9}
                onPress={() => setFocusedId(isFocused ? null : tileId)}
                style={[
                    styles.tile, 
                    size === 'grid' ? styles.tileGrid : (size === 'focus' ? styles.tileLarge : styles.tileSmall),
                    { backgroundColor: bgColor, borderRadius: 12 }
                ]}
            >
                {hasVideo && stream ? (
                    <RTCView 
                        streamURL={stream.toURL?.() || (Platform.OS === 'web' ? stream : '')} 
                        style={styles.rtc} 
                        objectFit="cover"
                        mirror={isLocal && !isScreen}
                    />
                ) : (
                    <View style={styles.avatarTile}>
                        <View style={styles.avatarCircle}>
                            <Text style={styles.avatarTxt}>{participant.identity.charAt(0).toUpperCase()}</Text>
                        </View>
                    </View>
                )}
                <View style={styles.participantOverlay}>
                    <View style={styles.participantNameRow}>
                        <View style={[styles.participantBadge, isScreen && styles.screenBadge]}>
                            <Text style={styles.participantName}>
                                {isLocal ? "Tu" : participant.identity}
                                {isScreen ? " (Schermo)" : ""}
                            </Text>
                        </View>
                        {handsRaised[participant?.identity] && (
                            <View style={[styles.statusIconRed, { backgroundColor: '#C9A84C', marginRight: 4, padding: 3 }]}>
                                <Icon name="hand" size={14} color="#111" />
                            </View>
                        )}
                        {isMuted && !isScreen && (
                            <View style={styles.statusIconRed}>
                                <Icon name="mic-off" size={10} color="#fff" />
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#C9A84C" />
                <Text style={{ color: '#554E40', marginTop: 10 }}>Inizializzazione LiveKit...</Text>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <LinearGradient colors={['#1A1917', '#12110F']} style={StyleSheet.absoluteFill} />

            {/* Reactions Layer */}
            <View style={styles.floatingEmojiContainer} pointerEvents="none">
                {floatingReactions.map(r => (
                    <FloatingEmoji 
                        key={r.id} 
                        emoji={r.emoji} 
                        onComplete={() => setFloatingReactions(prev => prev.filter(x => x.id !== r.id))} 
                    />
                ))}
            </View>

            {/* Header */}
            {!fullScreen && (
                <View style={styles.header}>
                    <TouchableOpacity onPress={onMinimize} style={styles.minimizeBtn}>
                        <Icon name="chevron-down" size={18} color="#C9A84C" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <View style={styles.roomBadge}>
                            <Text style={styles.roomName}>{roomId.toUpperCase()}</Text>
                            {connecting && <ActivityIndicator size="small" color="#C9A84C" />}
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => setShowDebug(!showDebug)} style={{ marginRight: 10 }}>
                        <Icon name="terminal" size={18} color={showDebug ? "#C9A84C" : "#E8E4D8"} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Video Content */}
            <View style={styles.gridContainer}>
                {focusedId ? (
                    <View style={styles.focusedLayout}>
                        {/* Focused Tile */}
                        <View style={styles.focusedTileWrapper}>
                            {(() => {
                                const parts = focusedId.split('-');
                                const source = parts.pop();
                                const identity = parts.join('-');
                                const p = participants.find(x => x.identity === identity);
                                return renderTile(p, source, 'focus');
                            })()}
                        </View>
                        
                        {/* Others Row */}
                        {!fullScreen && showOthers && (
                            <View style={styles.othersRowWrapper}>
                                <TouchableOpacity 
                                    style={styles.hideOthersBtn}
                                    onPress={() => setShowOthers(false)}
                                >
                                    <Icon name="chevron-down" size={14} color="#fff" />
                                </TouchableOpacity>
                                <ScrollView 
                                    horizontal 
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.othersScroll}
                                >
                                    {participants.flatMap(p => {
                                        const cameraTileId = `${p.identity}-${Track.Source.Camera}`;
                                        const screenTileId = `${p.identity}-${Track.Source.ScreenShare}`;
                                        const tiles = [];
                                        
                                        if (cameraTileId !== focusedId) {
                                            tiles.push(renderTile(p, Track.Source.Camera, 'small'));
                                        }
                                        
                                        const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
                                        if (screenPub && screenPub.isSubscribed && screenTileId !== focusedId) {
                                            tiles.push(renderTile(p, Track.Source.ScreenShare, 'small'));
                                        }
                                        
                                        return tiles;
                                    })}
                                </ScrollView>
                            </View>
                        )}
                        {!fullScreen && !showOthers && (
                            <TouchableOpacity 
                                style={styles.showOthersBtn}
                                onPress={() => setShowOthers(true)}
                            >
                                <Icon name="users" size={14} color="#C9A84C" />
                                <Text style={styles.showOthersTxt}>Mostra Partecipanti</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.videoGrid}>
                        {participants.flatMap(p => {
                            const res = [renderTile(p, Track.Source.Camera, 'grid')];
                            const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
                            if (screenPub && screenPub.isSubscribed) {
                                res.push(renderTile(p, Track.Source.ScreenShare, 'grid'));
                            }
                            return res;
                        })}
                    </ScrollView>
                )}
            </View>

            {/* Debug Panel */}
            {showDebug && (
                <View style={styles.debugPanel}>
                    <Text style={styles.debugTitle}>LIVEKIT DEBUG CONSOLE</Text>
                    <ScrollView style={styles.debugScroll}>
                        {(debugLogs || []).map((log, i) => (
                            <Text key={i} style={styles.debugText}>{log}</Text>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Controls */}
            {!fullScreen ? (
                <View style={styles.controls}>
                    <View style={styles.controlGroup}>
                        <TouchableOpacity 
                            ref={micBtnRef}
                            onPress={toggleMic} 
                            style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff, styles.ctrlBtnSplit]}
                        >
                            <Icon name={micOn ? "mic" : "mic-off"} size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={(e) => {
                                if (showMicMenu) {
                                    setShowMicMenu(false);
                                    setMainMenuType(null);
                                    setActiveSubMenu(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPos({ x: rect.left + rect.width / 2, y: rect.top });
                                    setMainMenuType('mic');
                                    setActiveSubMenu('input');
                                    setShowMicMenu(true);
                                    setShowCamMenu(false);
                                    setShowReactions(false);
                                    setEmojiPickerVisible(false);
                                    refreshDevices();
                                }
                            }} 
                            style={[styles.ctrlBtnChevron, !micOn && styles.ctrlBtnOff]}
                        >
                            <Icon name="chevron-up" size={12} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.controlGroup}>
                        <TouchableOpacity 
                            ref={camBtnRef}
                            onPress={toggleCam} 
                            style={[styles.ctrlBtn, !camOn && styles.ctrlBtnOff, styles.ctrlBtnSplit]}
                        >
                            <Icon name={camOn ? "video" : "video-off"} size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={(e) => { 
                                if (showCamMenu) {
                                    setShowCamMenu(false);
                                    setMainMenuType(null);
                                    setActiveSubMenu(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPos({ x: rect.left + rect.width / 2, y: rect.top });
                                    setMainMenuType('cam');
                                    setActiveSubMenu('video');
                                    setShowCamMenu(true);
                                    setShowMicMenu(false);
                                    setShowReactions(false);
                                    setEmojiPickerVisible(false);
                                    refreshDevices();
                                }
                            }} 
                            style={[styles.ctrlBtnChevron, !camOn && styles.ctrlBtnOff]}
                        >
                            <Icon name="chevron-up" size={12} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={toggleScreenShare} style={[styles.ctrlBtn, screenShareOn && styles.ctrlBtnActive]}>
                        <Icon name="monitor" size={20} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.ctrlBtn, handRaised && styles.ctrlBtnActive]} 
                        onPress={toggleHandRaise}
                    >
                        <Icon name="hand" size={20} color={handRaised ? "#fff" : "#fff"} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={(e) => {
                            if (showReactions) {
                                setShowReactions(false);
                            } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenuPos({ x: rect.left + rect.width / 2, y: rect.top });
                                setShowReactions(true);
                                setShowMicMenu(false);
                                setShowCamMenu(false);
                                setEmojiPickerVisible(false);
                            }
                        }} 
                        style={[styles.ctrlBtn, showReactions && styles.ctrlBtnActive]}
                    >
                        <Icon name="smile" size={20} color="#fff" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity onPress={toggleFullScreen} style={styles.ctrlBtn}>
                        <Icon name="maximize" size={20} color="#fff" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity onPress={() => leaveCall()} style={styles.hangupBtn}>
                        <Icon name="phone-off" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity 
                    onPress={toggleFullScreen} 
                    style={styles.exitFullScreenBtn}
                >
                    <Icon name="minimize-2" size={20} color="#fff" />
                </TouchableOpacity>
            )}

            {/* HOVER MENUS MOVED TO TOP-LEVEL ABSOLUTE VIEW (SEE BELOW) */}

            {/* TOP-LEVEL MENUS PORTAL */}
            {(showMicMenu || showCamMenu || showReactions || emojiPickerVisible) && (
                <View style={styles.deviceMenuContainer}>
                    <TouchableOpacity 
                        style={StyleSheet.absoluteFill} 
                        activeOpacity={1}
                        onPress={() => { 
                            setShowMicMenu(false); 
                            setShowCamMenu(false); 
                            setShowReactions(false);
                            setEmojiPickerVisible(false);
                        }} 
                    />
                    
                    {/* Reactions Bar Contextual */}
                    {showReactions && (
                        <View style={[
                            styles.reactionsPopup,
                            { 
                                // Centering: width is 260
                                left: Math.max(10, Math.min(menuPos.x - 180, Dimensions.get('window').width - 270)),
                                bottom: (Dimensions.get('window').height - menuPos.y) + 12 
                            }
                        ]}>
                            <View style={styles.reactionsRow}>
                                {EMOJI_REACTIONS.map(e => (
                                    <TouchableOpacity key={e} onPress={() => sendReaction(e)}>
                                        <Text style={{ fontSize: 24 }}>{e}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    onPress={(e) => {
                                        // Position the next picker relative to the plus button
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setMenuPos({ x: rect.left + rect.width / 2, y: rect.top });
                                        setShowReactions(false);
                                        setEmojiPickerVisible(true);
                                    }} 
                                    style={[styles.ctrlBtn, { width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' }]}
                                >
                                    <Icon name="plus" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Contextual Emoji Picker (Replaces Modal) - Tiered */}
                    {emojiPickerVisible && (
                        <View style={[
                            styles.fullEmojiBox,
                            {
                                // Centering: width is 340
                                left: Math.max(10, Math.min(menuPos.x - 240, Dimensions.get('window').width - 350)),
                                bottom: (Dimensions.get('window').height - menuPos.y) + 12,
                                width: 340,
                                height: 400,
                                zIndex: 1000000
                            }
                        ]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <Icon name="smile" size={16} color="#C9A84C" />
                                <Text style={{ color: '#C9A84C', fontSize: 13, fontWeight: '900', marginLeft: 8, letterSpacing: 1 }}>REAZIONI</Text>
                            </View>
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                {GSA_EMOJI_DATA.map(cat => (
                                    <View key={cat.name} style={{ marginBottom: 16 }}>
                                        <Text style={styles.emojiCategoryTitle}>{cat.name.toUpperCase()}</Text>
                                        <View style={styles.fullEmojiGrid}>
                                            {cat.emoji.map(emo => (
                                                <TouchableOpacity
                                                    key={emo}
                                                    style={styles.fullEmojiItem}
                                                    onPress={() => {
                                                        onEmojiReaction({ emoji: emo });
                                                        setEmojiPickerVisible(false);
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 24 }}>{emo}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Mic/Camera Device Menus - Discord Style Nested */}
                    {(showMicMenu || showCamMenu) && (
                        <View style={[
                            styles.deviceMenu, 
                            { 
                                left: Math.max(10, Math.min(menuPos.x - (activeSubMenu ? 320 : 160), Dimensions.get('window').width - (activeSubMenu ? 450 : 230))), 
                                bottom: (Dimensions.get('window').height - menuPos.y) + 12,
                                width: activeSubMenu ? 440 : 220,
                                flexDirection: 'row'
                            }
                        ]}>
                            {/* Main Categories column */}
                            <View style={{ width: 220 }}>
                                <Text style={styles.menuLabel}>{mainMenuType === 'mic' ? "IMPOSTAZIONI AUDIO" : "IMPOSTAZIONI VIDEO"}</Text>
                                <ScrollView style={styles.menuScroll}>
                                    {mainMenuType === 'mic' ? (
                                        <>
                                            <TouchableOpacity 
                                                style={[styles.menuItem, activeSubMenu === 'input' && styles.menuItemActive]} 
                                                onPress={() => setActiveSubMenu('input')}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.menuItemText}>Input Device</Text>
                                                    <Text style={styles.menuItemSubtext} numberOfLines={1}>
                                                        {audioInputs.find(d => d.deviceId === selectedAudioInput)?.label || 'Predefinito'}
                                                    </Text>
                                                </View>
                                                <Icon name="chevron-right" size={14} color="#B9BBBE" />
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={[styles.menuItem, activeSubMenu === 'output' && styles.menuItemActive]} 
                                                onPress={() => setActiveSubMenu('output')}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.menuItemText}>Output Device</Text>
                                                    <Text style={styles.menuItemSubtext} numberOfLines={1}>
                                                        {audioOutputs.find(d => d.deviceId === selectedAudioOutput)?.label || 'Predefinito'}
                                                    </Text>
                                                </View>
                                                <Icon name="chevron-right" size={14} color="#B9BBBE" />
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <TouchableOpacity 
                                            style={[styles.menuItem, activeSubMenu === 'video' && styles.menuItemActive]} 
                                            onPress={() => setActiveSubMenu('video')}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.menuItemText}>Camera</Text>
                                                <Text style={styles.menuItemSubtext} numberOfLines={1}>
                                                    {videoInputs.find(d => d.deviceId === selectedVideoInput)?.label || 'Predefinito'}
                                                </Text>
                                            </View>
                                            <Icon name="chevron-right" size={14} color="#B9BBBE" />
                                        </TouchableOpacity>
                                    )}
                                </ScrollView>
                                <View style={styles.menuDivider} />
                                <TouchableOpacity 
                                    style={styles.menuSettingsBtn} 
                                    onPress={() => {
                                        setShowMicMenu(false);
                                        setShowCamMenu(false);
                                        setActiveSubMenu(null);
                                        setMainMenuType(null);
                                        onOpenSettings && onOpenSettings();
                                    }}
                                >
                                    <Text style={styles.menuSettingsText}>Voice Settings</Text>
                                    <Icon name="settings" size={14} color="#B9BBBE" />
                                </TouchableOpacity>
                            </View>

                            {/* Sub-menu column for devices */}
                            {activeSubMenu && (
                                <View style={{ width: 220, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.05)' }}>
                                    <Text style={styles.menuLabel}>
                                        {activeSubMenu === 'input' ? "SELEZIONA INPUT" : 
                                         activeSubMenu === 'output' ? "SELEZIONA OUTPUT" : "SELEZIONA CAMERA"}
                                    </Text>
                                    <ScrollView style={styles.menuScroll}>
                                        {(activeSubMenu === 'input' ? audioInputs : 
                                          activeSubMenu === 'output' ? audioOutputs : videoInputs).map(d => (
                                            <TouchableOpacity 
                                                key={d.deviceId} 
                                                style={styles.menuItem}
                                                onPress={() => {
                                                    const kind = activeSubMenu === 'input' ? 'audioinput' : 
                                                                 activeSubMenu === 'output' ? 'audiooutput' : 'videoinput';
                                                    switchDevice(kind, d.deviceId);
                                                    // Keep menu open but update state? Discord keeps it open but updates selection.
                                                }}
                                            >
                                                <Text style={styles.menuItemText} numberOfLines={1}>{d.label || 'Dispositivo sconosciuto'}</Text>
                                                {(d.deviceId === (activeSubMenu === 'input' ? selectedAudioInput : 
                                                                  activeSubMenu === 'output' ? selectedAudioOutput : selectedVideoInput)) && (
                                                    <View style={styles.selectionCircle} />
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#1A1917' },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    minimizeBtn: { padding: 8 },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    roomName: { color: '#C9A84C', fontWeight: '800', fontSize: 13 },
    videoGrid: { 
        padding: 10, 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        justifyContent: 'center', 
        gap: 10,
        paddingBottom: 100 // Space for controls
    },
    gridContainer: { flex: 1, backgroundColor: '#12110F' },
    focusedLayout: { flex: 1, position: 'relative' },
    focusedTileWrapper: { flex: 1 },
    othersRowWrapper: { 
        height: 120, 
        backgroundColor: 'rgba(0,0,0,0.4)', 
        borderTopWidth: 1, 
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 10,
        position: 'relative'
    },
    othersScroll: { paddingHorizontal: 10, gap: 10 },
    hideOthersBtn: { 
        position: 'absolute', 
        top: -20, 
        left: '50%', 
        marginLeft: -15,
        width: 30, 
        height: 20, 
        backgroundColor: 'rgba(0,0,0,0.6)', 
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        justifyContent: 'center', 
        alignItems: 'center',
        zIndex: 10
    },
    showOthersBtn: {
        position: 'absolute',
        bottom: 20,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#2B2D31',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#C9A84C'
    },
    showOthersTxt: { color: '#C9A84C', fontWeight: 'bold', fontSize: 12 },
    tile: { backgroundColor: '#2B2D31', borderRadius: 12, overflow: 'hidden', position: 'relative', borderWidth: 2, borderColor: 'transparent' },
    tileGrid: { 
        width: Platform.OS === 'web' ? '48%' : '47.5%', 
        aspectRatio: 16/9, 
        margin: 5 
    },
    tileSmall: { width: 140, height: 90 },
    tileLarge: { flex: 1 },
    exitFullScreenBtn: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000
    },
    rtc: { flex: 1 },
    avatarTile: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#12110F' },
    avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1C1A16', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#C9A84C' },
    avatarTxt: { color: '#C9A84C', fontSize: 32, fontWeight: '800' },
    participantOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10 },
    participantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    participantBadge: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    screenBadge: { backgroundColor: '#C9A84C' },
    participantName: { color: '#fff', fontSize: 11, fontWeight: '800' },
    statusIconRed: { backgroundColor: '#ED4245', borderRadius: 10, padding: 2 },
    controls: { height: 100, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    controlGroup: { flexDirection: 'row', backgroundColor: '#2B2D31', borderRadius: 25, overflow: 'hidden' },
    ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2B2D31', justifyContent: 'center', alignItems: 'center' },
    ctrlBtnSplit: { borderTopRightRadius: 0, borderBottomRightRadius: 0, width: 40 },
    ctrlBtnChevron: { width: 22, height: 44, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    ctrlBtnOff: { backgroundColor: '#ED4245' },
    ctrlBtnActive: { backgroundColor: '#C9A84C' },
    hangupBtn: { width: 64, height: 44, borderRadius: 22, backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center' },
    
    // Device Menu
    deviceMenuContainer: { ...StyleSheet.absoluteFillObject, zIndex: 3000 },
    deviceMenu: { position: 'absolute', bottom: 110, backgroundColor: '#18191C', borderRadius: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, overflow: 'hidden' },
    menuLabel: { color: '#B9BBBE', fontSize: 10, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 8, letterSpacing: 0.5 },
    menuScroll: { maxHeight: 300 },
    menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    menuItemActive: { backgroundColor: 'rgba(201,168,76,0.1)' },
    menuItemText: { color: '#DCDDDE', fontSize: 13, flex: 1 },
    menuItemSubtext: { color: '#8E9297', fontSize: 11, marginTop: 2 },
    selectionCircle: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#C9A84C', borderWidth: 3, borderColor: '#18191C' },
    menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 4 },
    menuSettingsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.02)' },
    menuSettingsText: { color: '#DCDDDE', fontSize: 13, fontWeight: '600' },
    chatPanel: { height: 300, backgroundColor: '#12110F', borderTopWidth: 1, borderTopColor: '#C9A84C' },
    chatScroll: { flex: 1, padding: 15 },
    chatMsg: { marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 10, maxWidth: '80%' },
    chatMsgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(201,168,76,0.2)' },
    chatMsgSender: { color: '#C9A84C', fontSize: 10, fontWeight: '800', marginBottom: 2 },
    chatMsgText: { color: '#fff', fontSize: 14 },
    chatInputRow: { height: 60, flexDirection: 'row', padding: 10, gap: 10 },
    chatInput: { flex: 1, backgroundColor: '#1C1A16', borderRadius: 10, paddingHorizontal: 15, color: '#fff' },
    chatSendBtn: { width: 40, height: 40, backgroundColor: '#C9A84C', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    reactionsPopup: { 
        position: 'absolute', 
        backgroundColor: '#2B2D31', 
        padding: 12, 
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 1000000
    },
    reactionsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    fullEmojiBox: {
        position: 'absolute',
        backgroundColor: '#18191C',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 1000001
    },
    fullEmojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 },
    fullEmojiItem: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8 },
    emojiCategoryTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    floatingEmojiContainer: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
    floatingEmoji: { fontSize: 40, alignSelf: 'center' },
    debugPanel: { position: 'absolute', top: 70, left: 10, right: 10, bottom: 120, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 10, padding: 10, zIndex: 2000, borderWidth: 1, borderColor: '#C9A84C' },
    debugTitle: { color: '#C9A84C', fontWeight: 'bold', fontSize: 12, marginBottom: 5, textAlign: 'center' },
    debugScroll: { flex: 1 },
    debugText: { color: '#00FF00', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 2 }
});
