import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, Dimensions, TouchableOpacity, Text } from 'react-native';
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

  // Shared socket passed to both HotelChat and CallScreen
  const socketRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);

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
  };

  if (loading) {
    return <SplashScreen onDone={() => setLoading(false)} />;
  }

  if (!user) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LoginScreen onLogin={(userData) => handleLogin(userData)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.content}>
        <View style={styles.chatPane}>
          <HotelChat
            socket={socketRef.current}
            user={user}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            availableRooms={availableRooms}
            onJoinRoom={(roomId) => socketRef.current?.emit('join-room', { roomId })}
            onLogout={handleLogout}
            inCall={!!currentRoom}
          />
        </View>

        {/* ── CALL OVERLAY ── */}
        {!!currentRoom && (
          <View style={styles.callOverlay}>
            <CallScreen
              user={user}
              socket={socketRef.current}
              onLogout={handleLogout}
              onRoomsUpdate={setAvailableRooms}
              roomId={currentRoom}
              onClose={() => setCurrentRoom(null)}
              isTempProp={isTemp}
              onRoomState={(room, isT) => { setCurrentRoom(room); setIsTemp(isT); }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0C0B09' },
  content: { flex: 1, flexDirection: IS_MOBILE ? 'column' : 'row' },

  chatPane: {
    flex: 1,
  },
  callOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
  },
});

