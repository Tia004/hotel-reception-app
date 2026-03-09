/**
 * Icons.js — Flat SVG icon component for Expo Web
 * Uses native <svg> elements (works in Expo web via react-native-web DOM bridge)
 * Falls back to simple Text on native.
 */
import React from 'react';
import { Platform, Text } from 'react-native';

// Feather-style 24x24 icon paths
const PATHS = {
    mic: 'M12 2a4 4 0 014 4v6a4 4 0 01-8 0V6a4 4 0 014-4zm0 14a6 6 0 006-6h-2a4 4 0 01-8 0H6a6 6 0 006 6zm-1 2v2H9v2h6v-2h-2v-2h-2z',
    'mic-off': 'M19 19L5 5M12 2a4 4 0 014 4v4.5M8.27 8.27A4 4 0 008 10v2a4 4 0 005.73 3.61M6.11 6.11A6 6 0 006 12h2a4 4 0 004 4 3.94 3.94 0 001.39-.25M12 16a6 6 0 006-6h-2M11 18v2H9v2h6v-2h-2v-2',
    video: 'M23 7l-7 5 7 5V7z M1 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5z',
    'video-off': 'M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v4.34M23 7l-7 5 7 5V7z M1 1l22 22',
    phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.95 10.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.85 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7a2 2 0 011.72 2.01z',
    'phone-off': 'M10.68 13.31a16 16 0 006.72 6.72l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7a2 2 0 011.72 2.01v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 14.37 19.79 19.79 0 010 5.74 2 2 0 011.72 3.56h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11l-1.27 1.27M23 1L1 23',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
    'message-square': 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    'chevron-down': 'M6 9l6 6 6-6',
    x: 'M18 6L6 18M6 6l12 12',
    send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
    hand: 'M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v6M10 10V7a2 2 0 00-4 0v7M6 14v3a8 8 0 008 8M18 11a2 2 0 014 0v1a10 10 0 01-10 10H12a10 10 0 01-10-10C2 9.76 3.34 8.1 4.83 7L6 6',
    smile: 'M12 22A10 10 0 1012 2a10 10 0 000 20z M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
    headphones: 'M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z',
    'log-out': 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
};

/**
 * Renders a flat SVG icon.
 * @param {string} name - icon name from PATHS
 * @param {number} size - icon size in px
 * @param {string} color - stroke color
 * @param {object} style - additional style
 */
export const Icon = ({ name, size = 20, color = '#fff', style = {} }) => {
    const path = PATHS[name];

    if (Platform.OS === 'web' && path) {
        // On web: render real SVG (works via react-native-web DOM passthrough)
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: 'block', flexShrink: 0, ...style }}
            >
                {name.includes(' ') ? (
                    name.split(' ').map((p, i) => <path key={i} d={p} />)
                ) : path.split('M').filter(Boolean).map((seg, i) => (
                    <path key={i} d={`M${seg}`} />
                ))}
            </svg>
        );
    }

    // Fallback for native (won't normally be used since app targets web)
    return <Text style={{ color, fontSize: size * 0.7, ...style }}>●</Text>;
};

export default Icon;
