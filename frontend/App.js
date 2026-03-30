import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, Dimensions, TouchableOpacity, Text, Animated, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './components/LoginScreen';
import SplashScreen from './components/SplashScreen';
import CallScreen from './components/CallScreen';
import HotelChat from './components/HotelChat';
import CallDebug from './components/CallDebug';
import MediaSettings from './components/MediaSettings';
import io from 'socket.io-client';
import { Icon } from './components/Icons';
import ErrorBoundary from './components/ErrorBoundary';

let versionData = { version: '5.2.5' };
try {
  versionData = require('./version.json');
} catch (e) {
  console.warn('version.json not found, using fallback');
}

const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'https://hotel-reception-app.onrender.com/';
const APP_VERSION = versionData.version;
const SESSION_KEY = 'gsa_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const { width: SCREEN_W } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(!IS_MOBILE);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isTemp, setIsTemp] = useState(false);
  const [initialPeers, setInitialPeers] = useState([]);
  const [callPiP, setCallPiP] = useState(false);
  // On mobile: flip between "call view" and "chat view"
  const [mobileView, setMobileView] = useState('chat'); // 'chat' | 'call'
  const [showDebugCall, setShowDebugCall] = useState(false);

  // Hoisted call media states for syncing with User Bar
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [deafenOn, setDeafenOn] = useState(false);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const socketRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [loading, user]);

  // ── Session Persistence ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const { user: savedUser, loginTime } = JSON.parse(saved);
        if (Date.now() - loginTime < SESSION_DURATION) {
          handleLogin(savedUser, false);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (e) {
      console.log('Session restore failed', e);
    }

    // Inject global CSS for Web to remove blue focus outline
    const style = document.createElement('style');
    style.textContent = `
      *:focus { outline: none !important; }
      input:focus { outline: none !important; }
      textarea:focus { outline: none !important; }
      body { background-color: #0C0B09 !important; margin: 0; padding: 0; }
      html { background-color: #0C0B09 !important; }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Socket Management ──────────────────────────────────────────────────
  const initSocket = (userData) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const s = io(SIGNALING_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('join', { ...userData, profilePic: userData.profilePic || null });
      setSocketReady(true);
    });

    s.on('app-version', ({ version }) => {
      if (version !== APP_VERSION) {
        setShowUpdatePrompt(true);
      }
    });

    s.on('room-created', ({ roomId, isTemp, peers }) => {
      setCurrentRoom(roomId);
      setIsTemp(isTemp);
      setInitialPeers(peers || []);
      setCallPiP(false);
      // On mobile, immediately switch to call view when room created
      if (IS_MOBILE) setMobileView('call');
    });
    s.on('room-joined', ({ roomId, isTemp, peers }) => {
      setCurrentRoom(roomId);
      setIsTemp(isTemp);
      setInitialPeers(peers || []);
      setCallPiP(false);
      if (IS_MOBILE) setMobileView('call');
    });
    s.on('connect_error', () => setSocketReady(false));
    s.on('disconnect', () => setSocketReady(false));
    s.on('rooms-update', (rooms) => {
      setAvailableRooms(rooms);
    });

    s.on('force-disconnect', (data) => {
      console.warn('Force disconnect:', data.reason);
      handleLogout();
    });
  };

  // ── Auth ───────────────────────────────────────────────────────────────
  const handleLogin = (userData, save = true) => {
    setUser(userData);
    initSocket(userData);
    if (save && Platform.OS === 'web') {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: userData, loginTime: Date.now() }));
      } catch (e) { }
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocketReady(false);
    setUser(null);
    setCurrentRoom(null);
    setCallPiP(false);
    setMobileView('chat');
  };

  // Desktop: clicking a chat channel during a call → PiP
  const handleChannelClick = () => {
    if (inCall && !callPiP) {
      setCallPiP(true);
    }
  };

  // ── PiP Dragging & Magnetic Snapping ──────────────────────────────────
  const [pipPos, setPipPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const onDragStart = (e) => {
    if (Platform.OS !== 'web') return;
    isDragging.current = true;
    startPos.current = { x: e.clientX - pipPos.x, y: e.clientY - pipPos.y };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  };

  const onDragMove = (e) => {
    if (!isDragging.current) return;
    setPipPos({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const onDragEnd = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    // Magnetic Snap Logic
    const { width: winW, height: winH } = Dimensions.get('window');
    const pipW = 340;
    const pipH = 240;
    const padding = 20;

    const curX = pipPos.x;
    const curY = pipPos.y;

    // Corners
    const snaps = [
      { x: padding, y: padding }, // Top Left
      { x: winW - pipW - padding, y: padding }, // Top Right
      { x: padding, y: winH - pipH - padding }, // Bottom Left
      { x: winW - pipW - padding, y: winH - pipH - padding }, // Bottom Right
    ];

    let closest = snaps[0];
    let minDist = Infinity;
    snaps.forEach(p => {
      const dist = Math.sqrt(Math.pow(p.x - curX, 2) + Math.pow(p.y - curY, 2));
      if (dist < minDist) { minDist = dist; closest = p; }
    });
    setPipPos(closest);
  };

  useEffect(() => {
    if (callPiP && pipPos.x === 0 && pipPos.y === 0) {
      const { width: winW, height: winH } = Dimensions.get('window');
      setPipPos({ x: winW - 360, y: winH - 260 });
    }
  }, [callPiP]);

  const pipContainerStyle = {
    position: 'absolute',
    left: pipPos.x,
    top: pipPos.y,
    width: 340,
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.5)',
    backgroundColor: '#0C0B09',
    cursor: isDragging.current ? 'grabbing' : 'grab',
    transition: isDragging.current ? 'none' : 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  };

  return (
    <ErrorBoundary>
      <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
        <StatusBar style="light" />

        {loading ? (
          <SplashScreen onDone={() => setLoading(false)} />
        ) : !user ? (
          <LoginScreen onLogin={(userData) => handleLogin(userData)} />
        ) : IS_MOBILE ? (
          <>
            {/* Chat view */}
            {(!inCall || mobileView === 'chat') && (
              <View style={StyleSheet.absoluteFillObject}>
                <HotelChat
                  socket={socketRef.current}
                  user={user}
                  sidebarVisible={sidebarVisible}
                  onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
                  availableRooms={availableRooms}
                  onJoinRoom={(roomId) => {
                    socketRef.current?.emit('join-room', { roomId });
                    setCurrentRoom(roomId);
                    setIsTemp(false);
                    setCallPiP(false);
                    setMobileView('call');
                  }}
                  onLogout={handleLogout}
                  inCall={inCall}
                  hideChatColumn={false}
                  onChannelClick={null}
                  currentRoomId={currentRoom}
                  onOpenDebug={() => setShowDebugCall(true)}
                  onLeaveRoom={() => {
                    socketRef.current?.emit('leave-room', { roomId: currentRoom });
                    setCurrentRoom(null);
                    setCallPiP(false);
                    setMobileView('chat');
                  }}
                  micOn={micOn}
                  setMicOn={setMicOn}
                  camOn={camOn}
                  setCamOn={setCamOn}
                  deafenOn={deafenOn}
                  setDeafenOn={setDeafenOn}
                  screenShareOn={screenShareOn}
                  setScreenShareOn={setScreenShareOn}
                />
                {inCall && mobileView === 'chat' && (
                  <TouchableOpacity
                    style={styles.mobileReturnToCall}
                    onPress={() => setMobileView('call')}
                  >
                    <Icon name="video-filled" size={14} color="#111" />
                    <Text style={styles.mobileReturnTxt}>Torna alla chiamata</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Full-screen call view on mobile */}
            {inCall && mobileView === 'call' && (
              <View style={StyleSheet.absoluteFillObject}>
                <CallScreen
                  user={user}
                  socket={socketRef.current}
                  onLogout={handleLogout}
                  onRoomsUpdate={setAvailableRooms}
                  roomId={currentRoom}
                  initialPeers={initialPeers}
                  onClose={() => { setCurrentRoom(null); setMobileView('chat'); }}
                  isTempProp={isTemp}
                  onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
                  onMinimize={() => setMobileView('chat')}
                  micOn={micOn}
                  setMicOn={setMicOn}
                  camOn={camOn}
                  setCamOn={setCamOn}
                  deafenOn={deafenOn}
                  setDeafenOn={setDeafenOn}
                  screenShareOn={screenShareOn}
                  setScreenShareOn={setScreenShareOn}
                />
              </View>
            )}

            {showDebugCall && (
              <View style={StyleSheet.absoluteFillObject}>
                <CallDebug
                  socket={socketRef.current}
                  user={user}
                  onClose={() => setShowDebugCall(false)}
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.content}>
            <View style={showCallFull ? styles.chatPaneShrunk : styles.chatPane}>
              <HotelChat
                socket={socketRef.current}
                user={user}
                sidebarVisible={sidebarVisible}
                onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
                availableRooms={availableRooms}
                settingsVisible={settingsVisible}
                setSettingsVisible={setSettingsVisible}
                onJoinRoom={(roomId) => {
                  socketRef.current?.emit('join-room', { roomId });
                  setCurrentRoom(roomId);
                  setIsTemp(false);
                  setCallPiP(false);
                }}
                onLogout={handleLogout}
                inCall={inCall}
                hideChatColumn={showCallFull}
                onChannelClick={handleChannelClick}
                currentRoomId={currentRoom}
                onOpenDebug={() => setShowDebugCall(true)}
                onLeaveRoom={() => {
                  socketRef.current?.emit('leave-room', { roomId: currentRoom });
                  setCurrentRoom(null);
                  setCallPiP(false);
                  setMobileView('chat');
                }}
                micOn={micOn}
                setMicOn={setMicOn}
                camOn={camOn}
                setCamOn={setCamOn}
                deafenOn={deafenOn}
                setDeafenOn={setDeafenOn}
                screenShareOn={screenShareOn}
                setScreenShareOn={setScreenShareOn}
              />
            </View>

            {inCall && !callPiP && (
              <View style={styles.callPane}>
                <CallScreen
                  user={user}
                  socket={socketRef.current}
                  onLogout={handleLogout}
                  onRoomsUpdate={setAvailableRooms}
                  roomId={currentRoom}
                  initialPeers={initialPeers}
                  onClose={() => { setCurrentRoom(null); setCallPiP(false); }}
                  onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
                  onMinimize={() => setCallPiP(true)}
                  onOpenSettings={() => setSettingsVisible(true)}
                  micOn={micOn}
                  setMicOn={setMicOn}
                  camOn={camOn}
                  setCamOn={setCamOn}
                  deafenOn={deafenOn}
                  setDeafenOn={setDeafenOn}
                  screenShareOn={screenShareOn}
                  setScreenShareOn={setScreenShareOn}
                />
              </View>
            )}

            {inCall && callPiP && (
              <View
                style={pipContainerStyle}
                {...(Platform.OS === 'web' ? { onMouseDown: onDragStart } : {})}
              >
                <CallScreen
                  user={user}
                  socket={socketRef.current}
                  onLogout={handleLogout}
                  onRoomsUpdate={setAvailableRooms}
                  roomId={currentRoom}
                  initialPeers={initialPeers}
                  onClose={() => { setCurrentRoom(null); setCallPiP(false); }}
                  isTempProp={isTemp}
                  onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
                  isPiP={true}
                  onExpand={() => setCallPiP(false)}
                  onOpenSettings={() => setSettingsVisible(true)}
                  micOn={micOn}
                  setMicOn={setMicOn}
                  camOn={camOn}
                  setCamOn={setCamOn}
                  deafenOn={deafenOn}
                  setDeafenOn={setDeafenOn}
                  screenShareOn={screenShareOn}
                  setScreenShareOn={setScreenShareOn}
                />
              </View>
            )}

            {showDebugCall && (
              <View style={[StyleSheet.absoluteFillObject, { zIndex: 10000 }]}>
                <CallDebug
                  socket={socketRef.current}
                  user={user}
                  onClose={() => setShowDebugCall(false)}
                />
              </View>
            )}
          </View>
        )}

        <MediaSettings
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          user={user}
        />

        {/* Update Prompt Modal */}
        <Modal
          visible={showUpdatePrompt}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.updateOverlay}>
            <View style={styles.updateCard}>
              <Icon name="refresh" size={40} color="#C9A84C" />
              <Text style={styles.updateTitle}>NUOVA VERSIONE</Text>
              <Text style={styles.updateMsg}>
                È disponibile una nuova versione del sito. Ricarica la pagina per applicare gli aggiornamenti.
              </Text>
              <TouchableOpacity
                style={styles.updateBtn}
                onPress={() => Platform.OS === 'web' && window.location.reload()}
              >
                <Text style={styles.updateBtnTxt}>RICARICA ORA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Animated.View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0C0B09',
  },
  content: { flex: 1, flexDirection: 'row', position: 'relative', backgroundColor: '#0C0B09' },

  chatPane: { flex: 1 },
  chatPaneShrunk: {
    width: 260,
    maxWidth: 260,
  },
  callPane: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(201,168,76,0.06)',
    zIndex: 5,
    backgroundColor: '#1A1917',
  },

  // PiP floating container (desktop) logic moved to component
  mobileReturnToCall: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C9A84C',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 50,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  mobileReturnTxt: {
    color: '#111',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // Update Prompt Styles
  updateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateCard: {
    backgroundColor: '#16140F',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  updateTitle: {
    color: '#C9A84C',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 20,
    letterSpacing: 2,
  },
  updateMsg: {
    color: '#A8A090',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    marginBottom: 30,
  },
  updateBtn: {
    backgroundColor: '#C9A84C',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  updateBtnTxt: {
    color: '#111',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  },
});
