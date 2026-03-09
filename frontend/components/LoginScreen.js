import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const USERS = {
    'admin': { password: 'password123', role: 'Amministratore' },
    'reception1': { password: 'password123', role: 'Reception Principale' },
    'reception2': { password: 'password123', role: 'Reception Secondaria' },
    'mobile_lobby': { password: 'password123', role: 'Telefono Hall' }
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
            setError('Credenziali non valide. Riprova.');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formWrapper}>
                <Animated.View entering={FadeInDown.duration(800).springify()} style={styles.formContainer}>
                    <Text style={styles.title}>Benvenuto</Text>
                    <Text style={styles.subtitle}>Comuncazioni Interne P2P</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Nome Utente</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="es. reception1"
                            placeholderTextColor="rgba(80, 60, 50, 0.5)"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Inserisci password"
                            placeholderTextColor="rgba(80, 60, 50, 0.5)"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    {error ? (
                        <Animated.Text entering={FadeInUp} style={styles.errorText}>{error}</Animated.Text>
                    ) : null}

                    <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.8}>
                        <Text style={styles.buttonText}>ACCEDI AL SISTEMA</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7EDE2', // Warm, soft 2026 organic background (Soft Peach / Cream)
        justifyContent: 'center',
    },
    formWrapper: {
        width: '100%',
        paddingHorizontal: 20,
    },
    formContainer: {
        padding: 35,
        width: '100%',
        maxWidth: 450,
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.65)', // Warm glassmorphism
        borderRadius: 30, // Squircle / heavy border radius
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        shadowColor: '#DDA77B', // Soft diffused terracotta shadow
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
        elevation: 10,
    },
    title: {
        fontSize: 34,
        fontWeight: '700',
        color: '#3A4D39', // Forest Green text
        textAlign: 'center',
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    },
    subtitle: {
        fontSize: 16,
        color: '#739072', // Sage Green
        textAlign: 'center',
        marginBottom: 40,
        fontWeight: '500',
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        color: '#4A3B32', // Dark Espresso
        fontSize: 13,
        marginBottom: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 5,
    },
    input: {
        backgroundColor: '#FFFFFF',
        color: '#4A3B32',
        borderRadius: 20, // Pill shaped input
        padding: 18,
        fontSize: 16,
        shadowColor: '#DDA77B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: 'rgba(240, 220, 200, 0.5)',
    },
    button: {
        backgroundColor: '#E78865', // Warm Terracotta "Dopamine" color
        padding: 20,
        borderRadius: 25, // Pill shaped button
        alignItems: 'center',
        marginTop: 15,
        shadowColor: '#E78865',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 5,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
        letterSpacing: 1,
    },
    errorText: {
        color: '#D85C5C',
        textAlign: 'center',
        marginBottom: 15,
        fontWeight: '600',
    }
});
