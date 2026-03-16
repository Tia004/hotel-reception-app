import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

export default function DynamicBackground() {
    if (Platform.OS === 'web') {
        const css = `
        @keyframes waveFloat {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes auraRotate {
            0% { transform: rotate(0deg) scale(1); opacity: 0.3; }
            50% { transform: rotate(180deg) scale(1.2); opacity: 0.6; }
            100% { transform: rotate(360deg) scale(1); opacity: 0.3; }
        }
        .dynamic-bg-container {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(-45deg, #090806, #14110C, #18150D, #050403);
            background-size: 400% 400%;
            animation: waveFloat 15s ease infinite;
            z-index: -10;
            overflow: hidden;
        }
        .aura-glow1 {
            position: absolute;
            top: -20%; left: -10%;
            width: 70%; height: 70%;
            background: radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%);
            animation: auraRotate 25s infinite linear;
            pointer-events: none;
        }
        .aura-glow2 {
            position: absolute;
            bottom: -20%; right: -10%;
            width: 80%; height: 80%;
            background: radial-gradient(circle, rgba(107,127,196,0.04) 0%, transparent 70%);
            animation: auraRotate 30s infinite linear reverse;
            pointer-events: none;
        }
        `;
        return (
            <View style={StyleSheet.absoluteFillObject}>
                <style>{css}</style>
                <div className="dynamic-bg-container">
                    <div className="aura-glow1" />
                    <div className="aura-glow2" />
                </div>
            </View>
        );
    }
    
    // Non-web fallback
    return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090806' }]} />;
}
