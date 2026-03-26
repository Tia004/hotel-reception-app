/**
 * pushNotifications.js — v5.0.7
 * Browser Push Notification utility.
 * Supports Chrome, Firefox, and Safari (with fallback).
 */

/**
 * Request notification permission from the user.
 * Call once on app startup.
 * @returns {Promise<boolean>} true if granted
 */
export async function requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    try {
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch (e) {
        console.warn('Push notification permission failed:', e);
        return false;
    }
}

/**
 * Show a browser notification for a new chat message.
 * @param {string} sender   - Username of the sender
 * @param {string} channel  - Channel name (e.g. "generale")
 * @param {string} hotelName - Hotel name (e.g. "Duchessa Isabella")
 * @param {string} text     - Message text (truncated if too long)
 */
export function showMessageNotification(sender, channel, hotelName, text) {
    if (typeof window === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const truncated = text.length > 80 ? text.slice(0, 80) + '…' : text;

    try {
        const n = new Notification(`GSA — ${sender} (@${channel})`, {
            body: truncated,
            icon: '/assets/logo.png',
            badge: '/assets/logo.png',
            tag: `gsa-msg-${channel}`,
            renotify: true,
            silent: false,
            data: { sender, channel, hotelName },
        });

        // Clicking the notification focuses the app window
        n.onclick = () => {
            window.focus();
            n.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => n.close(), 5000);
    } catch (e) {
        console.warn('Notification failed:', e);
    }
}

/**
 * Show a notification for a voice room event.
 * @param {string} type      - 'joined' | 'left'
 * @param {string} username  - username of who joined/left
 * @param {string} roomName  - room display name
 */
export function showRoomNotification(type, username, roomName) {
    if (typeof window === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    // if (!document.hidden) return; // Removed for better reliability on Mac as requested

    const msg = type === 'joined'
        ? `${username} è entrato/a nella stanza ${roomName}`
        : `${username} ha lasciato la stanza ${roomName}`;

    try {
        const n = new Notification('GSA Hotels — Stanza vocale', {
            body: msg,
            icon: '/assets/logo.png',
            tag: `gsa-room-${roomName}`,
            silent: true,
        });
        setTimeout(() => n.close(), 4000);
    } catch (e) { /* silent fail */ }
}
