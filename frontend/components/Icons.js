/**
 * Icons.js — v2.8.0
 * Uses @expo/vector-icons (Ionicons + Feather) for quality, uniform icons.
 * Ionicons is bundled with Expo SDK - no extra install needed.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';

// Icon name mapping: our semantic names → pack + icon names
const ICON_MAP = {
    // Audio
    'mic': { pack: 'feather', name: 'mic' },
    'mic-off': { pack: 'feather', name: 'mic-off' },
    'headphones': { pack: 'feather', name: 'headphones' },
    'volume-2': { pack: 'feather', name: 'volume-2' },
    // Video
    'video': { pack: 'feather', name: 'video' },
    'video-off': { pack: 'feather', name: 'video-off' },
    'camera': { pack: 'feather', name: 'camera' },
    // Monitor / Share
    'monitor': { pack: 'feather', name: 'monitor' },
    'share-screen': { pack: 'ionicons', name: 'desktop-outline' },
    'screen-share': { pack: 'ionicons', name: 'desktop-outline' },
    'stop-screen-share': { pack: 'ionicons', name: 'desktop-outline' },
    // Communication
    'message-square': { pack: 'feather', name: 'message-square' },
    'send': { pack: 'feather', name: 'send' },
    'at-sign': { pack: 'feather', name: 'at-sign' },
    // Phone
    'phone': { pack: 'feather', name: 'phone' },
    'phone-off': { pack: 'ionicons', name: 'call-outline' },
    'phone-forward': { pack: 'ionicons', name: 'call-sharp' },
    // UI Navigation
    'chevron-down': { pack: 'feather', name: 'chevron-down' },
    'chevron-right': { pack: 'feather', name: 'chevron-right' },
    'chevron-left': { pack: 'feather', name: 'chevron-left' },
    'arrow-down': { pack: 'feather', name: 'chevron-down' },
    'x': { pack: 'feather', name: 'x' },
    'plus': { pack: 'feather', name: 'plus' },
    'more-horizontal': { pack: 'feather', name: 'more-horizontal' },
    'search': { pack: 'feather', name: 'search' },
    'maximize-2': { pack: 'feather', name: 'maximize-2' },
    'minimize-2': { pack: 'feather', name: 'minimize-2' },
    // Media controls
    'play': { pack: 'feather', name: 'play' },
    'pause': { pack: 'feather', name: 'pause' },
    // Hand / Reactions
    'hand': { pack: 'ionicons', name: 'hand-right-outline' },
    'hand-raised': { pack: 'ionicons', name: 'hand-right' },
    'smile': { pack: 'feather', name: 'smile' },
    'happy': { pack: 'ionicons', name: 'happy-outline' },
    'gift': { pack: 'feather', name: 'gift' },
    // User
    'user': { pack: 'feather', name: 'user' },
    'users': { pack: 'feather', name: 'users' },
    'log-out': { pack: 'feather', name: 'log-out' },
    // Settings
    'settings': { pack: 'feather', name: 'settings' },
    // Content
    'image': { pack: 'feather', name: 'image' },
    'paperclip': { pack: 'feather', name: 'paperclip' },
    'hash': { pack: 'feather', name: 'hash' },
    'star': { pack: 'feather', name: 'star' },
    'building': { pack: 'ionicons', name: 'business' },
    'bookmark': { pack: 'feather', name: 'bookmark' },
    'bell': { pack: 'feather', name: 'bell' },
    'pin': { pack: 'ionicons', name: 'pin-outline' },
    'link': { pack: 'feather', name: 'link' },
    'download': { pack: 'feather', name: 'download' },
    'menu': { pack: 'feather', name: 'menu' },
    'info': { pack: 'feather', name: 'info' },
    'alert-triangle': { pack: 'feather', name: 'alert-triangle' },
    'file-text': { pack: 'feather', name: 'file-text' },
    // Edit / Actions (MUST match exact Feather names used in components)
    'edit': { pack: 'feather', name: 'edit-2' },
    'edit-2': { pack: 'feather', name: 'edit-2' },
    'trash': { pack: 'feather', name: 'trash-2' },
    'trash-2': { pack: 'feather', name: 'trash-2' },
    'copy': { pack: 'feather', name: 'copy' },
    'check': { pack: 'feather', name: 'check' },
    'check-check': { pack: 'ionicons', name: 'checkmark-done-outline' },
    'clock': { pack: 'feather', name: 'clock' },
    // Reply / Forward
    'corner-up-left': { pack: 'feather', name: 'corner-up-left' },
    'corner-up-right': { pack: 'feather', name: 'corner-up-right' },
    'forward': { pack: 'ionicons', name: 'arrow-redo-outline' },
    // Filled variants for call controls
    'mic-filled': { pack: 'ionicons', name: 'mic' },
    'mic-off-filled': { pack: 'ionicons', name: 'mic-off' },
    'video-filled': { pack: 'ionicons', name: 'videocam' },
    'video-off-filled': { pack: 'ionicons', name: 'videocam-off' },
};

/**
 * Icon component — renders a quality vector icon.
 * @param {string} name    - semantic icon name (see ICON_MAP)
 * @param {number} size    - icon size in px (default 20)
 * @param {string} color   - icon color (default #fff)
 * @param {object} style   - extra style (for margin/padding etc.)
 */
export const Icon = ({ name, size = 20, color = '#fff', style }) => {
    const config = ICON_MAP[name];
    if (!config) {
        // Unknown icon fallback — render a feather icon with the raw name
        return <Feather name="help-circle" size={size} color={color} style={style} />;
    }
    if (config.pack === 'ionicons') {
        return <Ionicons name={config.name} size={size} color={color} style={style} />;
    }
    return <Feather name={config.name} size={size} color={color} style={style} />;
};

export default Icon;
