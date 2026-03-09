/**
 * Icons.js — Uses @expo/vector-icons (Ionicons) for quality, uniform icons.
 * Ionicons is bundled with Expo SDK - no extra install needed.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';

// Icon name mapping: our semantic names → Ionicons names
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
    // Communication
    'message-square': { pack: 'feather', name: 'message-square' },
    'send': { pack: 'feather', name: 'send' },
    'at-sign': { pack: 'feather', name: 'at-sign' },
    // Phone
    'phone': { pack: 'feather', name: 'phone' },
    'phone-off': { pack: 'ionicons', name: 'call-outline' },
    'phone-forward': { pack: 'ionicons', name: 'call-sharp' },
    // UI
    'chevron-down': { pack: 'feather', name: 'chevron-down' },
    'chevron-right': { pack: 'feather', name: 'chevron-right' },
    'x': { pack: 'feather', name: 'x' },
    'plus': { pack: 'feather', name: 'plus' },
    'more-horizontal': { pack: 'feather', name: 'more-horizontal' },
    'search': { pack: 'feather', name: 'search' },
    // Hand / Reactions
    'hand': { pack: 'ionicons', name: 'hand-right-outline' },
    'smile': { pack: 'feather', name: 'smile' },
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
    'bookmark': { pack: 'feather', name: 'bookmark' },
    'bell': { pack: 'feather', name: 'bell' },
    'pin': { pack: 'ionicons', name: 'pin-outline' },
    'edit': { pack: 'feather', name: 'edit-2' },
    'trash': { pack: 'feather', name: 'trash-2' },
    'copy': { pack: 'feather', name: 'copy' },
    'link': { pack: 'feather', name: 'link' },
    'menu': { pack: 'feather', name: 'menu' },
    'check': { pack: 'feather', name: 'check' },
    'info': { pack: 'feather', name: 'info' },
    'alert-triangle': { pack: 'feather', name: 'alert-triangle' },
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
