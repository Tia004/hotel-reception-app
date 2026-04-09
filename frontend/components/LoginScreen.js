import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Dimensions, Image, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const API_BASE = (process.env.EXPO_PUBLIC_SIGNALING_URL || "https://gsahotels-calls.onrender.com").replace(/\/$/, "");


export default function LoginScreen({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) {
            setError('Inserisci nome utente e password.');
            return;
        }

        setLoading(true);
        setError('');

        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                if (attempts > 1) {
                    setError(`Riconnessione in corso... (Tentativo ${attempts}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, 2000));
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        username: username.toLowerCase().trim(), 
                        password 
                    }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                const data = await response.json();

                if (response.ok) {
                    onLogin({ 
                        username: data.username, 
                        station: data.station,
                        bio: data.bio,
                        profilePic: data.profilePic 
                    });
                    return; // Success!
                } else {
                    setError(data.error || 'OPS! Credenziali non valide.');
                    return; // Stop on logic errors (401, etc)
                }
            } catch (err) {
                lastError = err;
                console.error(`Login attempt ${attempts} failed:`, err);
                
                // Retry only on network/timeout errors
                if (err.name === 'AbortError' || err.message.includes('fetch')) {
                    continue;
                }
                break; // Stop on other unexpected errors
            }
        }

        if (lastError) {
            setError(`Errore di connessione: il server sembra non rispondere.\nPer favore, riprova tra qualche secondo.`);
        }
        setLoading(false);
    };


    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient colors={['#050505', '#11100C', '#050505']} style={StyleSheet.absoluteFillObject} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formWrapper}>
                <Animated.View entering={FadeInDown.duration(800).springify().damping(15)} style={styles.glassPanel}>
                    {/* LinearGradient for 3D Puffy Glass effect */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.formContainer}
                    >
                        {/* Premium Typography Header */}
                        <View style={styles.headerContainer}>
                            <Image
                                source={require('../assets/logo.png')}
                                style={{ width: 100, height: 100, marginBottom: 16 }}
                                resizeMode="contain"
                            />
                            <Text style={styles.title}>GSA HOTELS</Text>
                            <Text style={styles.subtitle}>COMUNICAZIONI INTERNE</Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>NOME UTENTE</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Inserisci ID postazione"
                                placeholderTextColor="#888"
                                value={username}
                                onChangeText={setUsername}
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>PASSWORD</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Inserisci password"
                                placeholderTextColor="#888"
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                            />
                        </View>

                        {error ? (
                            <Animated.Text entering={FadeInUp.springify()} style={styles.errorText}>
                                {error}
                            </Animated.Text>
                        ) : null}

                        <TouchableOpacity 
                            style={styles.button} 
                            onPress={handleLogin} 
                            activeOpacity={0.8}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#1a1a1a', '#0a0a0a']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.buttonGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#C9A84C" />
                                ) : (
                                    <Text style={styles.buttonText}>ACCEDI ➔</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </LinearGradient>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0C0B09',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    formWrapper: {
        width: '100%',
        paddingHorizontal: 20,
        zIndex: 10,
    },
    glassPanel: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        borderRadius: 30,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.8,
        shadowRadius: 30,
        elevation: 25,
        backgroundColor: 'rgba(20, 18, 16, 0.4)',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.1)',
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } : {}),
    },
    formContainer: {
        padding: 40,
        paddingTop: 50,
        width: '100%',
    },
    headerContainer: {
        marginBottom: 45,
        alignItems: 'center',
    },
    title: {
        fontSize: 34,
        fontWeight: '300',
        color: '#FFFFFF',
        letterSpacing: 4,
        marginBottom: 8,
        fontFamily: Platform.OS === 'web' ? 'sans-serif' : (Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-light'),
    },
    subtitle: {
        fontSize: 12,
        color: '#C9A84C',
        fontWeight: '600',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    inputGroup: {
        marginBottom: 25,
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginBottom: 8,
        fontWeight: '500',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    input: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        color: '#FFFFFF',
        padding: 18,
        fontSize: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    button: {
        marginTop: 30,
        borderRadius: 100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
    },
    buttonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.2)',
    },
    buttonText: {
        color: '#C9A84C',
        fontWeight: '800',
        fontSize: 15,
        letterSpacing: 2,
    },
    errorText: {
        color: '#FF6B6B',
        textAlign: 'center',
        marginBottom: 15,
        fontWeight: '500',
        fontSize: 14,
        letterSpacing: 0.5
    }
});
