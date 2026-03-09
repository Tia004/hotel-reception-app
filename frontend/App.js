import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import LoginScreen from './components/LoginScreen';
import CallScreen from './components/CallScreen';

export default function App() {
  const [user, setUser] = useState(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {!user ? (
        <LoginScreen onLogin={(userData) => setUser(userData)} />
      ) : (
        <CallScreen user={user} onLogout={() => setUser(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
