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
              <Icon name="alert-circle" size={50} color="#C9A84C" />
            </View>
            <Text style={styles.title}>ECCEZIONE DI SISTEMA</Text>
            <Text style={styles.message}>
              L'applicazione ha riscontrato un errore imprevisto. Prova a ricaricare o pulire la sessione se il problema persiste.
            </Text>
            
            <View style={styles.btnRow}>
                <TouchableOpacity 
                    style={styles.retryBtn} 
                    onPress={() => Platform.OS === 'web' && window.location.reload()}
                >
                    <Text style={styles.retryTxt}>RICARICA ORA</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.clearBtn} 
                    onPress={() => {
                        if (Platform.OS === 'web') {
                            localStorage.clear();
                            window.location.reload();
                        }
                    }}
                >
                    <Text style={styles.clearTxt}>PULISCI SESSIONE</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.errorBox}>
                <Text style={styles.errorDetail}>
                    {this.state.error?.toString()}
                    {"\n\n"}
                    {this.state.error?.stack?.split('\n').slice(0, 10).join('\n')}
                </Text>
            </View>
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
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 2
  },
  message: {
    color: '#A8A090',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
    width: '100%',
  },
  retryBtn: {
    flex: 1,
    backgroundColor: '#C9A84C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryTxt: {
    color: '#111',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1
  },
  clearBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  clearTxt: {
    color: '#C9A84C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  errorDetail: {
    color: '#6A6660',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'System',
    textAlign: 'left'
  }
});
