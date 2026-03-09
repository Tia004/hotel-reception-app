import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, Dimensions, TouchableOpacity, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './components/LoginScreen';
import CallScreen from './components/CallScreen';
import HotelChat from './components/HotelChat';
import io from 'socket.io-client';
import { Icon } from './components/Icons';

const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';
const SESSION_KEY = 'gsa_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const { width: SCREEN_W } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

// Views
const VIEW_CALLS = 'calls';
const VIEW_CHAT = 'chat';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState(VIEW_CHAT);
  const [sidebarVisible, setSidebarVisible] = useState(!IS_MOBILE);
  const [availableRooms, setAvailableRooms] = useState([]);
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
  }, []);

  // ── Socket Management ──────────────────────────────────────────────────
  const initSocket = (userData) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const s = io(SIGNALING_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('join', userData);
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
  };

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

      {/* ── Tab bar (mobile only) ──── */}
      {IS_MOBILE && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, activeView === VIEW_CHAT && styles.tabBtnActive]}
            onPress={() => setActiveView(VIEW_CHAT)}
          >
            <Icon name="hash" size={20} color={activeView === VIEW_CHAT ? '#D4AF37' : '#72767D'} />
            <Text style={[styles.tabLabel, activeView === VIEW_CHAT && styles.tabLabelActive]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeView === VIEW_CALLS && styles.tabBtnActive]}
            onPress={() => setActiveView(VIEW_CALLS)}
          >
            <Icon name="video" size={20} color={activeView === VIEW_CALLS ? '#D4AF37' : '#72767D'} />
            <Text style={[styles.tabLabel, activeView === VIEW_CALLS && styles.tabLabelActive]}>Chiamate</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>
        {/* ── Desktop: side-by-side; Mobile: tab-based ── */}
        {(!IS_MOBILE || activeView === VIEW_CHAT) && (
          <View style={[styles.chatPane, IS_MOBILE && { flex: 1 }]}>
            <HotelChat
              socket={socketRef.current}
              user={user}
              sidebarVisible={sidebarVisible}
              onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
              availableRooms={availableRooms}
              onJoinRoom={(roomId) => socketRef.current?.emit('join-room', { roomId })}
            />
          </View>
        )}

        {(!IS_MOBILE || activeView === VIEW_CALLS) && (
          <View style={[styles.callPane, IS_MOBILE && { flex: 1 }]}>
            <CallScreen
              user={user}
              socket={socketRef.current}
              onLogout={handleLogout}
              onRoomsUpdate={setAvailableRooms}
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
    flex: IS_MOBILE ? undefined : 0.45,
    borderRightWidth: IS_MOBILE ? 0 : 1,
    borderRightColor: 'rgba(201,168,76,0.08)',
  },
  callPane: {
    flex: IS_MOBILE ? undefined : 0.55,
  },

  // Mobile tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#0C0B09',
    borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.08)',
    ...(Platform.OS === 'web' ? { paddingTop: 0 } : { paddingTop: 40 }),
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#C9A84C' },
  tabLabel: { color: '#6E6960', fontSize: 14, fontWeight: '600' },
  tabLabelActive: { color: '#C9A84C' },
});
