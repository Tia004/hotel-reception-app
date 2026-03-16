import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, Dimensions, TouchableOpacity, Text, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './components/LoginScreen';
import CallScreen from './components/CallScreen';
import HotelChat from './components/HotelChat';
import io from 'socket.io-client';
import { Icon } from './components/Icons';

import SplashScreen from './components/SplashScreen';

const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';
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
  const [callPiP, setCallPiP] = useState(false); // PiP mode

  // Shared socket passed to both HotelChat and CallScreen
  const socketRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);

  // ── Fluid Animations ───────────────────────────────────────────────────
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
          handleLogin(savedUser, false); // restore without re-saving
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (e) {
      console.log('Session restore failed', e);
    }

    // Inject global CSS for Web to remove blue focus outline
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `
        *:focus { outline: none !important; }
        input:focus { outline: none !important; }
        textarea:focus { outline: none !important; }
      `;
      document.head.appendChild(style);
    }
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
    
    // Globally handle entering a room
    s.on('room-created', ({ roomId, isTemp }) => {
      setCurrentRoom(roomId);
      setIsTemp(isTemp);
      setCallPiP(false); // Start in full mode
    });
    s.on('room-joined', ({ roomId, isTemp }) => {
      setCurrentRoom(roomId);
      setIsTemp(isTemp);
      setCallPiP(false); // Start in full mode
    });
    s.on('connect_error', () => setSocketReady(false));
    s.on('disconnect', () => setSocketReady(false));
    s.on('force-disconnect', (data) => {
      alert(`Disconnesso: ${data.reason}`);
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
  };

  // When user clicks a chat channel while in a call → shrink call to PiP
  const handleChannelClick = () => {
    if (currentRoom && !callPiP) {
      setCallPiP(true);
    }
  };

  if (loading) {
    return (
      <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
        <SplashScreen onDone={() => setLoading(false)} />
      </Animated.View>
    );
  }

  if (!user) {
    return (
      <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
        <StatusBar style="light" />
        <LoginScreen onLogin={(userData) => handleLogin(userData)} />
      </Animated.View>
    );
  }

  const inCall = !!currentRoom;
  const showCallFull = inCall && !callPiP;

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {/* HotelChat — full width when no call or PiP, shrunk when call is full */}
        <View style={showCallFull ? styles.chatPaneShrunk : styles.chatPane}>
          <HotelChat
            socket={socketRef.current}
            user={user}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            availableRooms={availableRooms}
            onJoinRoom={(roomId) => socketRef.current?.emit('join-room', { roomId })}
            onLogout={handleLogout}
            inCall={inCall}
            hideChatColumn={showCallFull}
            onChannelClick={handleChannelClick}
          />
        </View>

        {/* Call Screen — full pane when not PiP */}
        {inCall && !callPiP && (
          <View style={styles.callPane}>
            <CallScreen
              user={user}
              socket={socketRef.current}
              onLogout={handleLogout}
              onRoomsUpdate={setAvailableRooms}
              roomId={currentRoom}
              onClose={() => { setCurrentRoom(null); setCallPiP(false); }}
              isTempProp={isTemp}
              onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
              onMinimize={() => setCallPiP(true)}
            />
          </View>
        )}

        {/* Call Screen — PiP floating window */}
        {inCall && callPiP && (
          <View style={styles.pipContainer}>
            <CallScreen
              user={user}
              socket={socketRef.current}
              onLogout={handleLogout}
              onRoomsUpdate={setAvailableRooms}
              roomId={currentRoom}
              onClose={() => { setCurrentRoom(null); setCallPiP(false); }}
              isTempProp={isTemp}
              onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
              isPiP={true}
              onExpand={() => setCallPiP(false)}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0C0B09' },
  content: { flex: 1, flexDirection: IS_MOBILE ? 'column' : 'row', position: 'relative' },

  chatPane: {
    flex: 1,
  },
  // When call is full-screen, sidebar shrinks to just the left sidebar width
  chatPaneShrunk: {
    width: IS_MOBILE ? '100%' : 260,
    maxWidth: IS_MOBILE ? undefined : 260,
  },
  callPane: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(201,168,76,0.06)',
  },
  // PiP floating container
  pipContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
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
    borderColor: 'rgba(201,168,76,0.3)',
  },
});
