import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * DynamicBackground — v2.7.1
 * A visually striking animated background with flowing gradient waves
 * and pulsing aurora glows. Renders via pure CSS keyframes for zero
 * React re-renders and maximum performance.
 */
export default function DynamicBackground() {
    if (Platform.OS === 'web') {
        const css = `
        @keyframes bgShift {
            0%   { background-position: 0% 50%; }
            25%  { background-position: 50% 100%; }
            50%  { background-position: 100% 50%; }
            75%  { background-position: 50% 0%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes auraFloat1 {
            0%   { transform: translate(0, 0) scale(1); opacity: 0.15; }
            25%  { transform: translate(60px, -40px) scale(1.15); opacity: 0.25; }
            50%  { transform: translate(-30px, 50px) scale(1.3); opacity: 0.2; }
            75%  { transform: translate(40px, 30px) scale(1.1); opacity: 0.3; }
            100% { transform: translate(0, 0) scale(1); opacity: 0.15; }
        }
        @keyframes auraFloat2 {
            0%   { transform: translate(0, 0) scale(1.2); opacity: 0.1; }
            33%  { transform: translate(-80px, 60px) scale(0.9); opacity: 0.22; }
            66%  { transform: translate(50px, -30px) scale(1.3); opacity: 0.15; }
            100% { transform: translate(0, 0) scale(1.2); opacity: 0.1; }
        }
        @keyframes auraFloat3 {
            0%   { transform: translate(0, 0) scale(1); opacity: 0.08; }
            50%  { transform: translate(-60px, -50px) scale(1.4); opacity: 0.18; }
            100% { transform: translate(0, 0) scale(1); opacity: 0.08; }
        }
        .dynamic-bg-root {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            overflow: hidden;
            pointer-events: none;
        }
        .dynamic-bg-gradient {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(-45deg, #090806, #1a150c, #0d0f18, #120e08, #090806);
            background-size: 500% 500%;
            animation: bgShift 20s ease-in-out infinite;
        }
        .dynamic-aura-1 {
            position: absolute;
            top: -15%;
            left: -5%;
            width: 55%;
            height: 55%;
            background: radial-gradient(circle, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.03) 50%, transparent 70%);
            border-radius: 50%;
            filter: blur(40px);
            animation: auraFloat1 18s ease-in-out infinite;
        }
        .dynamic-aura-2 {
            position: absolute;
            bottom: -10%;
            right: -5%;
            width: 60%;
            height: 60%;
            background: radial-gradient(circle, rgba(107,127,196,0.1) 0%, rgba(107,127,196,0.02) 50%, transparent 70%);
            border-radius: 50%;
            filter: blur(60px);
            animation: auraFloat2 22s ease-in-out infinite;
        }
        .dynamic-aura-3 {
            position: absolute;
            top: 40%;
            left: 25%;
            width: 40%;
            height: 40%;
            background: radial-gradient(circle, rgba(201,140,60,0.08) 0%, transparent 60%);
            border-radius: 50%;
            filter: blur(50px);
            animation: auraFloat3 25s ease-in-out infinite;
        }
        `;
        return (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <style dangerouslySetInnerHTML={{ __html: css }} />
                <div className="dynamic-bg-root">
                    <div className="dynamic-bg-gradient" />
                    <div className="dynamic-aura-1" />
                    <div className="dynamic-aura-2" />
                    <div className="dynamic-aura-3" />
                </div>
            </View>
        );
    }
    
    // Non-web fallback
    return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090806' }]} />;
}
