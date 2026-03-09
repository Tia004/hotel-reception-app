import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Dimensions } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const USERS = {
    'admin': { password: 'password123', role: 'Amministratore' },
    'reception1': { password: 'password123', role: 'Reception Principale' },
    'reception2': { password: 'password123', role: 'Reception Secondaria' },
    'mobile_lobby': { password: 'password123', role: 'Telefono Hall' }
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
                borderRadius: size / 2, // Perfect circle for soft glow
                ...(Platform.OS === 'web' ? { filter: 'blur(80px)', opacity: 0.5 } : { opacity: 0.2, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 50 })
            },
            animStyle
        ]} />
    );
};

export default function LoginScreen({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        const user = USERS[username.toLowerCase().trim()];
        if (user && user.password === password) {
            onLogin({ username: username.toLowerCase().trim(), station: user.role });
        } else {
            setError('OPS! Credenziali non valide.');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Elegant Dark Background Elements */}
            <AmbientGlow color="#1e1836" size={500} top={-150} left={-200} delay={0} />
            <AmbientGlow color="#3a2e1d" size={400} top={height * 0.6} left={width * 0.5} delay={2000} />

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

                        <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.8}>
                            <LinearGradient
                                colors={['#D4AF37', '#AA8C2C']} // Soft Metallic Gold gradient
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.buttonGradient}
                            >
                                <Text style={styles.buttonText}>ACCEDI ➔</Text>
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
        backgroundColor: '#0C0B09', // Deep v2.5.0 black
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
        color: '#C9A84C', // Refined v2.5.0 gold
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
        shadowColor: '#C9A84C',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    buttonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    buttonText: {
        color: '#111',
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

