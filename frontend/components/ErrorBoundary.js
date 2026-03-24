import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Icon } from './Icons';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Icon name="alert-triangle" size={40} color="#ED4245" />
            </View>
            <Text style={styles.title}>Ops! Qualcosa è andato storto</Text>
            <Text style={styles.message}>
              Si è verificato un errore durante il caricamento dell'interfaccia.
              A volte basta ricaricare per risolvere.
            </Text>
            
            <TouchableOpacity 
              style={styles.retryBtn} 
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.location.reload();
                } else {
                  this.setState({ hasError: false });
                }
              }}
            >
              <Text style={styles.retryTxt}>RICARICA APP</Text>
            </TouchableOpacity>

            <Text style={styles.errorDetail}>
              {this.state.error?.toString()}
            </Text>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0B09',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#16140F',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(237, 66, 69, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(237, 66, 69, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    color: '#C9A84C',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1
  },
  message: {
    color: '#A8A090',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  retryBtn: {
    backgroundColor: '#C9A84C',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryTxt: {
    color: '#111',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1
  },
  errorDetail: {
    color: '#3A3630',
    fontSize: 10,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'System',
    marginTop: 24,
    textAlign: 'center'
  }
});
