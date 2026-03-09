/**
 * SplashScreen.js — v2.5.0
 * Beautiful gold/black loading screen shown during initial app load.
 * Animated GSA monogram, shimmering text, fade-out on complete.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

export default function SplashScreen({ onDone }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.7)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;
    const exitAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Entrance
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, damping: 12, stiffness: 90, useNativeDriver: true }),
        ]).start(() => {
            // Start shimmer loop
            Animated.loop(
                Animated.sequence([
                    Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                    Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
                ])
            ).start();

            // Staggered pulsing dots
            const pulseDot = (anim, delay) =>
                Animated.loop(Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
                ])).start();
            pulseDot(dot1, 0);
            pulseDot(dot2, 200);
            pulseDot(dot3, 400);
        });

        // Fade out and call onDone after ~2.5s
        const timer = setTimeout(() => {
            Animated.timing(exitAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(onDone);
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    const shimmerOpacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

    return (
        <Animated.View style={[styles.root, { opacity: exitAnim }]}>
            <LinearGradient colors={['#0A0900', '#100E0C', '#141210']} style={StyleSheet.absoluteFill} />

            {/* Decorative rings */}
            <View style={styles.ringOuter} />
            <View style={styles.ringMiddle} />
            <View style={styles.ringInner} />

            {/* Logo monogram */}
            <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                <LinearGradient colors={['#D4AF37', '#C9A84C', '#B8920A']} style={styles.logoGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Animated.Text style={[styles.logoText, { opacity: shimmerOpacity }]}>GSA</Animated.Text>
                </LinearGradient>
                <View style={styles.logoShadow} />
            </Animated.View>

            {/* Brand text */}
            <Animated.View style={[styles.brandBlock, { opacity: fadeAnim }]}>
                <Text style={styles.brandTitle}>GRAND SÉJOUR ALBERGHIERO</Text>
                <View style={styles.brandDivider} />
                <Text style={styles.brandSub}>SISTEMA DI COMUNICAZIONE</Text>
            </Animated.View>

            {/* Loading dots */}
            <View style={styles.dotsRow}>
                {[dot1, dot2, dot3].map((d, i) => (
                    <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
                ))}
            </View>

            {/* Version watermark */}
            <Text style={styles.version}>v2.5.0</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },

    // Decorative rings
    ringOuter: { position: 'absolute', width: 500, height: 500, borderRadius: 250, borderWidth: 1, borderColor: 'rgba(201,168,76,0.06)' },
    ringMiddle: { position: 'absolute', width: 340, height: 340, borderRadius: 170, borderWidth: 1, borderColor: 'rgba(201,168,76,0.09)' },
    ringInner: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(201,168,76,0.14)' },

    // Logo
    logoWrap: { position: 'relative', marginBottom: 36 },
    logoGradient: { width: 110, height: 110, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    logoText: { color: '#0A0900', fontSize: 38, fontWeight: '900', letterSpacing: 4 },
    logoShadow: {
        position: 'absolute', bottom: -8, left: 10, right: 10, height: 20,
        backgroundColor: 'rgba(201,168,76,0.25)', borderRadius: 50,
        ...(Platform.OS === 'web' ? { filter: 'blur(10px)' } : {}),
    },

    // Brand
    brandBlock: { alignItems: 'center', gap: 10 },
    brandTitle: { color: '#C9A84C', fontSize: 16, fontWeight: '700', letterSpacing: 4, textAlign: 'center' },
    brandDivider: { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
    brandSub: { color: '#554E40', fontSize: 11, letterSpacing: 3, textAlign: 'center' },

    // Dots
    dotsRow: { flexDirection: 'row', gap: 10, marginTop: 50 },
    dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#C9A84C' },

    // Version
    version: { position: 'absolute', bottom: 28, color: '#2A2520', fontSize: 11, letterSpacing: 2 },
});
