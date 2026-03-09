import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Dimensions } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const USERS = {
    'admin': { password: 'password123', role: 'Amministratore' },
    'reception1': { password: 'password123', role: 'Reception Principale' },
    'reception2': { password: 'password123', role: 'Reception Secondaria' },
    'mobile_lobby': { password: 'password123', role: 'Telefono Hall' }
};

// Funky Background Element Animation
const FunkyShape = ({ color, size, top, left, delay }) => {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    React.useEffect(() => {
        rotation.value = withDelay(delay, withRepeat(withTiming(360, { duration: 15000, easing: Easing.linear }), -1, false));
        scale.value = withDelay(delay, withRepeat(withSequence(withTiming(1.2, { duration: 3000 }), withTiming(0.8, { duration: 3000 })), -1, true));
    }, []);

    const animStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `${rotation.value}deg` },
                { scale: scale.value }
            ]
        };
    });

    return (
        <Animated.View style={[
            {
                position: 'absolute',
                top, left,
                width: size, height: size,
                backgroundColor: color,
                borderRadius: size * 0.3, // Squircle-ish random shape
                opacity: 0.8
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
            {/* Pop-Art Background Elements */}
            <View style={styles.backgroundGrid} />
            <FunkyShape color="#B2FF05" size={300} top={-50} left={-100} delay={0} />
            <FunkyShape color="#FF0055" size={200} top={height * 0.6} left={width * 0.7} delay={1000} />
            <FunkyShape color="#00E5FF" size={150} top={height * 0.8} left={-50} delay={500} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formWrapper}>
                <Animated.View entering={FadeInDown.duration(800).springify().damping(12)} style={styles.formContainer}>

                    {/* Dopamine Typography Header */}
                    <View style={styles.headerContainer}>
                        <Text style={styles.titleShadow}>RECEPTION</Text>
                        <Text style={styles.title}>RECEPTION</Text>
                        <Text style={styles.subtitle}>SISTEMA P2P</Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>NOME UTENTE</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="es. reception1"
                            placeholderTextColor="#666"
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
                            placeholderTextColor="#666"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    {error ? (
                        <Animated.Text entering={FadeInUp.springify()} style={styles.errorText}>
                            ⚠️ {error}
                        </Animated.Text>
                    ) : null}

                    <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.9}>
                        <View style={styles.buttonShadow} />
                        <View style={styles.buttonFront}>
                            <Text style={styles.buttonText}>ACCEDI ORA ➔</Text>
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#6B38FB', // Electric Purple
        justifyContent: 'center',
        overflow: 'hidden'
    },
    backgroundGrid: {
        position: 'absolute',
        width: '200%',
        height: '200%',
        // A CSS-lite way to fake a grid in React Native without heavy SVGs
        opacity: 0.1,
        borderWidth: 2,
        borderColor: '#000',
        borderStyle: 'dashed'
    },
    formWrapper: {
        width: '100%',
        paddingHorizontal: 20,
        zIndex: 10, // Above shapes
    },
    formContainer: {
        padding: 30,
        paddingTop: 40,
        width: '100%',
        maxWidth: 450,
        alignSelf: 'center',
        backgroundColor: '#000000', // Pitch Black form background for massive contrast
        borderRadius: 0, // Brutalist sharp edges combined with pop colors
        borderWidth: 4,
        borderColor: '#000000',
        shadowColor: '#000',
        shadowOffset: { width: 10, height: 10 }, // Hard retro shadow
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 20,
    },
    headerContainer: {
        marginBottom: 35,
        position: 'relative'
    },
    titleShadow: {
        fontSize: 52,
        fontWeight: '900',
        color: '#B2FF05', // Lime Green shadow offset
        position: 'absolute',
        top: 4,
        left: 4,
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
        letterSpacing: -2,
        transform: [{ rotate: '-2deg' }]
    },
    title: {
        fontSize: 52,
        fontWeight: '900',
        color: '#FFFFFF',
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
        letterSpacing: -2,
        transform: [{ rotate: '-2deg' }], // Slight tilt for funkiness
        zIndex: 2
    },
    subtitle: {
        fontSize: 18,
        color: '#FF0055', // Hot Pink
        fontWeight: '800',
        marginTop: -5,
        transform: [{ rotate: '-2deg' }],
        marginLeft: 5,
        letterSpacing: 2
    },
    inputGroup: {
        marginBottom: 25,
    },
    label: {
        color: '#B2FF05', // Lime Green
        fontSize: 16,
        marginBottom: 8,
        fontWeight: '900',
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Arial' : 'sans-serif',
    },
    input: {
        backgroundColor: '#FFFFFF',
        color: '#000000',
        padding: 18,
        fontSize: 18,
        fontWeight: 'bold',
        borderWidth: 3,
        borderColor: '#000',
        // Brutalist shadow trick
        borderBottomWidth: 8,
        borderRightWidth: 8,
    },
    button: {
        marginTop: 20,
        position: 'relative',
    },
    buttonShadow: {
        position: 'absolute',
        top: 6,
        left: 6,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        borderWidth: 3,
        borderColor: '#000'
    },
    buttonFront: {
        backgroundColor: '#B2FF05', // Lime Green button
        padding: 20,
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#000',
        transform: [{ translateX: -4 }, { translateY: -4 }]
    },
    buttonText: {
        color: '#000000',
        fontWeight: '900',
        fontSize: 20,
        letterSpacing: 1,
    },
    errorText: {
        color: '#FF0055', // Hot Pink error
        backgroundColor: '#000',
        padding: 10,
        borderWidth: 2,
        borderColor: '#FF0055',
        textAlign: 'center',
        marginBottom: 15,
        fontWeight: '900',
        fontSize: 16
    }
});
