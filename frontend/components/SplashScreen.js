/**
 * SplashScreen.js — v5.0.7
 * Beautiful gold/black loading screen shown during initial app load.
 * Animated GSA monogram, shimmering text, fade-out on complete.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import versionData from '../version.json';

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
            Animated.spring(scaleAnim, { toValue: 1, damping: 10, stiffness: 80, useNativeDriver: true }),
        ]).start(() => {
            // Stronger shimmer/breathing loop for the logo
            Animated.loop(
                Animated.sequence([
                    Animated.timing(shimmerAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                    Animated.timing(shimmerAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
                ])
            ).start();
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scaleAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
                    Animated.timing(scaleAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
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

        // Fade out and call onDone after ~3.5s to let the animation play a bit longer
        const timer = setTimeout(() => {
            Animated.timing(exitAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(onDone);
        }, 3500);

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

            {/* Logo Image */}
            <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                <Animated.Image
                    source={require('../assets/logo.png')}
                    style={[styles.logoImg, { opacity: shimmerOpacity }]}
                    resizeMode="contain"
                />
            </Animated.View>

            {/* Brand text */}
            <Animated.View style={[styles.brandBlock, { opacity: fadeAnim }]}>
                <Text style={styles.brandTitle}>App Videochiamate di GSA Hotels</Text>
            </Animated.View>

            {/* Loading dots */}
            <View style={styles.dotsRow}>
                {[dot1, dot2, dot3].map((d, i) => (
                    <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
                ))}
            </View>

            {/* Version watermark */}
            <Text style={styles.version}>v{versionData.version}</Text>
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
    logoWrap: { position: 'relative', marginBottom: 30, justifyContent: 'center', alignItems: 'center' },
    logoImg: { width: 140, height: 140 },

    // Brand
    brandBlock: { alignItems: 'center', gap: 10, marginTop: 10 },
    brandTitle: { color: '#C9A84C', fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },

    // Dots
    dotsRow: { flexDirection: 'row', gap: 10, marginTop: 50 },
    dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#C9A84C' },

    // Version
    version: { position: 'absolute', bottom: 28, color: '#2A2520', fontSize: 11, letterSpacing: 2 },
});
