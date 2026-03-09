/**
 * HotelChat.js — v2.3.0
 * Discord-style persistent hotel chat sidebar.
 * Hotels: Duchessa Isabella, Blumen, Sant'Orsola.
 * Channels per hotel: #generale, #media, #annunci
 * Features: 48h message expiry, pin messages, emoji reactions, images, GIF URLs.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, Image, Dimensions, Platform, Modal, Animated
} from 'react-native';
import { Icon } from './Icons';
import { EMOJI_CATEGORIES, ALL_EMOJI } from '../utils/emoji_data';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

// ─── Hotel structure ───────────────────────────────────────────────────────────
const HOTELS = [
    {
        id: 'duchessa',
        name: 'Duchessa Isabella',
        color: '#D4AF37',
        channels: [
            { id: 'duchessa-generale', name: 'generale' },
            { id: 'duchessa-media', name: 'media' },
            { id: 'duchessa-annunci', name: 'annunci' },
        ]
    },
    {
        id: 'blumen',
        name: 'Hotel Blumen',
        color: '#3BA55D',
        channels: [
            { id: 'blumen-generale', name: 'generale' },
            { id: 'blumen-media', name: 'media' },
            { id: 'blumen-annunci', name: 'annunci' },
        ]
    },
    {
        id: 'santorsola',
        name: "Sant'Orsola",
        color: '#5865F2',
        channels: [
            { id: 'santorsola-generale', name: 'generale' },
            { id: 'santorsola-media', name: 'media' },
            { id: 'santorsola-annunci', name: 'annunci' },
        ]
    },
];

const ALL_CHANNELS = HOTELS.flatMap(h => h.channels);

// ─── Sub-components ────────────────────────────────────────────────────────────

const EmojiPickerModal = ({ visible, onClose, onSelect }) => {
    const [tab, setTab] = useState(0);
    const [search, setSearch] = useState('');
    const filtered = search ? ALL_EMOJI.filter(e => true) : EMOJI_CATEGORIES[tab]?.emoji || [];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.emojiOverlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={styles.emojiModal}>
                    {/* Search */}
                    <View style={styles.emojiSearchRow}>
                        <Icon name="search" size={14} color="#72767D" />
                        <TextInput
                            style={styles.emojiSearch}
                            placeholder="Cerca emoji..."
                            placeholderTextColor="#72767D"
                            value={search}
                            onChangeText={setSearch}
                        />
                    </View>
                    {/* Category tabs */}
                    {!search && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiTabs}>
                            {EMOJI_CATEGORIES.map((cat, i) => (
                                <TouchableOpacity key={i} onPress={() => setTab(i)} style={[styles.emojiTab, tab === i && styles.emojiTabActive]}>
                                    <Text style={styles.emojiTabText}>{cat.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                    {/* Grid */}
                    <ScrollView style={styles.emojiGrid} contentContainerStyle={styles.emojiGridContent}>
                        <View style={styles.emojiRow}>
                            {filtered.map((e, i) => (
                                <TouchableOpacity key={i} style={styles.emojiItem} onPress={() => { onSelect(e); onClose(); }}>
                                    <Text style={styles.emojiChar}>{e}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
};

const PinnedMessagesModal = ({ visible, onClose, messages }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.pinnedOverlay}>
            <View style={styles.pinnedModal}>
                <View style={styles.pinnedHeader}>
                    <Icon name="bookmark" size={16} color="#D4AF37" />
                    <Text style={styles.pinnedTitle}>Messaggi Fissati</Text>
                    <TouchableOpacity onPress={onClose}><Icon name="x" size={18} color="#B5BAC1" /></TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1 }}>
                    {messages.length === 0 && (
                        <Text style={styles.noPinnedText}>Nessun messaggio fissato.</Text>
                    )}
                    {messages.map(m => (
                        <View key={m.id} style={styles.pinnedItem}>
                            <Text style={styles.pinnedSender}>{m.sender}</Text>
                            <Text style={styles.pinnedText} numberOfLines={3}>{m.text}</Text>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
    </Modal>
);

const MessageItem = ({ msg, user, socket, channelId, onReact, onPin, onUnpin }) => {
    const [contextVisible, setContextVisible] = useState(false);
    const [emojiVisible, setEmojiVisible] = useState(false);
    const timeStr = new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(msg.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const isMine = msg.sender === user.username;

    // Calculate time left
    const msLeft = msg.expiresAt - Date.now();
    const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000));

    return (
        <TouchableOpacity
            onLongPress={() => setContextVisible(true)}
            activeOpacity={0.9}
            style={[styles.msgRow, isMine && styles.msgRowMine]}
        >
            {/* Avatar */}
            {!isMine && (
                <View style={styles.msgAvatar}>
                    <Text style={styles.msgAvatarText}>{msg.sender.charAt(0).toUpperCase()}</Text>
                </View>
            )}

            <View style={[styles.msgBubble, isMine && styles.msgBubbleMine]}>
                {/* Header */}
                <View style={styles.msgHeader}>
                    <Text style={[styles.msgSender, isMine && styles.msgSenderMine]}>{msg.sender}</Text>
                    <Text style={styles.msgTime}>{dateStr} {timeStr}</Text>
                    {msg.pinned && <Icon name="bookmark" size={11} color="#D4AF37" style={{ marginLeft: 6 }} />}
                </View>

                {/* Content */}
                {msg.text ? <Text style={styles.msgText}>{msg.text}</Text> : null}
                {msg.imageData ? (
                    <Image source={{ uri: msg.imageData }} style={styles.msgImage} resizeMode="contain" />
                ) : null}
                {msg.gifUrl ? (
                    <Image source={{ uri: msg.gifUrl }} style={styles.msgImage} resizeMode="contain" />
                ) : null}

                {/* Reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <View style={styles.reactionsRow}>
                        {Object.entries(msg.reactions).map(([emoji, count]) => (
                            <TouchableOpacity key={emoji} style={styles.reactionBadge} onPress={() => onReact(msg.id, emoji)}>
                                <Text>{emoji}</Text>
                                <Text style={styles.reactionCount}>{count}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Expiry warning */}
                {hoursLeft < 6 && (
                    <Text style={styles.expiryText}>Scade tra {hoursLeft}h</Text>
                )}
            </View>

            {/* Context menu */}
            <Modal visible={contextVisible} transparent animationType="fade" onRequestClose={() => setContextVisible(false)}>
                <TouchableOpacity style={styles.contextOverlay} activeOpacity={1} onPress={() => setContextVisible(false)}>
                    <View style={styles.contextMenu}>
                        <TouchableOpacity style={styles.contextItem} onPress={() => { setContextVisible(false); setEmojiVisible(true); }}>
                            <Icon name="smile" size={16} color="#B5BAC1" />
                            <Text style={styles.contextText}>Reagisci</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.contextItem} onPress={() => { setContextVisible(false); onPin(msg); }}>
                            <Icon name="bookmark" size={16} color="#D4AF37" />
                            <Text style={styles.contextText}>{msg.pinned ? 'Rimuovi pin' : 'Fissa messaggio'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.contextItem} onPress={() => {
                            setContextVisible(false);
                            if (Platform.OS === 'web') navigator.clipboard?.writeText(msg.text || '');
                        }}>
                            <Icon name="copy" size={16} color="#B5BAC1" />
                            <Text style={styles.contextText}>Copia testo</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <EmojiPickerModal
                visible={emojiVisible}
                onClose={() => setEmojiVisible(false)}
                onSelect={(e) => onReact(msg.id, e)}
            />
        </TouchableOpacity>
    );
};

// ─── Main HotelChat ────────────────────────────────────────────────────────────
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar }) {
    const [activeChannel, setActiveChannel] = useState(HOTELS[0].channels[0]);
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [expandedHotels, setExpandedHotels] = useState({ duchessa: true, blumen: false, santorsola: false });
    const [draft, setDraft] = useState('');
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [pinnedModalVisible, setPinnedModalVisible] = useState(false);
    const scrollRef = useRef(null);

    // ── Socket listeners ───────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const loadChannel = (ch) => {
            socket.emit('join-channel', { channelId: ch.id });
            socket.emit('get-channel-history', { channelId: ch.id });
        };

        // Pre-join all channels
        ALL_CHANNELS.forEach(ch => socket.emit('join-channel', { channelId: ch.id }));

        socket.on('channel-history', ({ channelId, messages: msgs, pinned: pins }) => {
            setMessages(prev => ({ ...prev, [channelId]: msgs }));
            setPinned(prev => ({ ...prev, [channelId]: pins }));
        });

        socket.on('channel-message', ({ channelId, message }) => {
            setMessages(prev => ({
                ...prev,
                [channelId]: [...(prev[channelId] || []), message]
            }));
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        });

        socket.on('message-pinned', ({ channelId, message }) => {
            setPinned(prev => {
                const existing = prev[channelId] || [];
                if (existing.find(m => m.id === message.id)) return prev;
                return { ...prev, [channelId]: [...existing, message] };
            });
            setMessages(prev => ({
                ...prev,
                [channelId]: (prev[channelId] || []).map(m => m.id === message.id ? { ...m, pinned: true } : m)
            }));
        });

        socket.on('message-unpinned', ({ channelId, messageId }) => {
            setPinned(prev => ({ ...prev, [channelId]: (prev[channelId] || []).filter(m => m.id !== messageId) }));
            setMessages(prev => ({
                ...prev,
                [channelId]: (prev[channelId] || []).map(m => m.id === messageId ? { ...m, pinned: false } : m)
            }));
        });

        socket.on('channel-reaction-update', ({ channelId, messageId, emoji, count }) => {
            setMessages(prev => ({
                ...prev,
                [channelId]: (prev[channelId] || []).map(m =>
                    m.id === messageId ? { ...m, reactions: { ...m.reactions, [emoji]: count } } : m
                )
            }));
        });

        // Get history for active channel
        ALL_CHANNELS.forEach(ch => socket.emit('get-channel-history', { channelId: ch.id }));

        return () => {
            socket.off('channel-history');
            socket.off('channel-message');
            socket.off('message-pinned');
            socket.off('message-unpinned');
            socket.off('channel-reaction-update');
        };
    }, [socket]);

    // ── Auto-scroll on new messages ────────────────────────────────────────
    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }, [messages[activeChannel?.id]]);

    // ── Actions ────────────────────────────────────────────────────────────
    const sendMessage = (text = null, imageData = null, gifUrl = null) => {
        const content = text || draft.trim();
        if (!content && !imageData && !gifUrl) return;
        if (!socket || !activeChannel) return;
        socket.emit('channel-message', {
            channelId: activeChannel.id,
            text: content,
            imageData,
            gifUrl,
        });
        setDraft('');
    };

    const handleImagePick = () => {
        if (Platform.OS === 'web') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => sendMessage('', ev.target.result, null);
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        }
    };

    const handlePin = (msg) => {
        if (!socket) return;
        if (msg.pinned) {
            socket.emit('unpin-message', { channelId: activeChannel.id, messageId: msg.id });
        } else {
            socket.emit('pin-message', { channelId: activeChannel.id, messageId: msg.id });
        }
    };

    const handleReact = (messageId, emoji) => {
        if (!socket) return;
        socket.emit('channel-reaction', { channelId: activeChannel.id, messageId, emoji });
    };

    const toggleHotel = (hotelId) => {
        setExpandedHotels(prev => ({ ...prev, [hotelId]: !prev[hotelId] }));
    };

    const switchChannel = (ch) => {
        setActiveChannel(ch);
        setMessages(prev => ({ ...prev })); // force re-render
    };

    const currentMessages = (messages[activeChannel?.id] || []).filter(m => m.expiresAt > Date.now());
    const currentPinned = pinned[activeChannel?.id] || [];
    const activeHotel = HOTELS.find(h => h.channels.some(c => c.id === activeChannel?.id));

    return (
        <View style={[styles.container, IS_MOBILE && !sidebarVisible && styles.containerHidden]}>
            {/* ── Sidebar ──────────────────────────────────────── */}
            <View style={[styles.sidebar, IS_MOBILE && !sidebarVisible && { display: 'none' }]}>
                <View style={styles.sidebarHeader}>
                    <Text style={styles.sidebarTitle}>GSA HOTELS</Text>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.channelList}>
                    {HOTELS.map(hotel => (
                        <View key={hotel.id}>
                            <TouchableOpacity style={styles.hotelHeader} onPress={() => toggleHotel(hotel.id)} activeOpacity={0.8}>
                                <Icon
                                    name={expandedHotels[hotel.id] ? 'chevron-down' : 'chevron-right'}
                                    size={12} color="#8E9297"
                                />
                                <Text style={styles.hotelName}>{hotel.name.toUpperCase()}</Text>
                            </TouchableOpacity>

                            {expandedHotels[hotel.id] && hotel.channels.map(ch => {
                                const isActive = activeChannel?.id === ch.id;
                                const msgCount = (messages[ch.id] || []).filter(m => m.expiresAt > Date.now()).length;
                                return (
                                    <TouchableOpacity
                                        key={ch.id}
                                        style={[styles.channelItem, isActive && styles.channelItemActive]}
                                        onPress={() => switchChannel(ch)}
                                        activeOpacity={0.8}
                                    >
                                        <Icon name="hash" size={16} color={isActive ? '#DCDDDE' : '#8E9297'} />
                                        <Text style={[styles.channelName, isActive && styles.channelNameActive]}>
                                            {ch.name}
                                        </Text>
                                        {msgCount > 0 && (
                                            <View style={[styles.channelBadge, { backgroundColor: hotel.color + '33' }]}>
                                                <Text style={[styles.channelBadgeText, { color: hotel.color }]}>{msgCount}</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </ScrollView>

                {/* User info at bottom */}
                <View style={styles.sidebarFooter}>
                    <View style={styles.footerAvatar}>
                        <Text style={styles.footerAvatarText}>{user?.username?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.footerUsername}>{user?.username}</Text>
                        <Text style={styles.footerStation}>{user?.station}</Text>
                    </View>
                </View>
            </View>

            {/* ── Chat Area ─────────────────────────────────────── */}
            <View style={styles.chatArea}>
                {/* Channel header */}
                <View style={styles.channelHeader}>
                    {IS_MOBILE && (
                        <TouchableOpacity onPress={onToggleSidebar} style={{ marginRight: 12 }}>
                            <Icon name="menu" size={20} color="#B5BAC1" />
                        </TouchableOpacity>
                    )}
                    <Icon name="hash" size={20} color="#B5BAC1" />
                    <Text style={styles.channelHeaderName}>{activeChannel?.name}</Text>
                    <Text style={styles.channelHeaderHotel}>· {activeHotel?.name}</Text>
                    <View style={{ flex: 1 }} />
                    {currentPinned.length > 0 && (
                        <TouchableOpacity onPress={() => setPinnedModalVisible(true)} style={styles.headerBtn}>
                            <Icon name="bookmark" size={18} color="#D4AF37" />
                            <Text style={styles.headerBtnText}>{currentPinned.length}</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={styles.expiryNote}>I messaggi scadono dopo 48h</Text>
                </View>

                {/* Messages */}
                <ScrollView
                    ref={scrollRef}
                    style={styles.messagesArea}
                    contentContainerStyle={styles.messagesContent}
                    showsVerticalScrollIndicator={false}
                >
                    {currentMessages.length === 0 && (
                        <View style={styles.emptyChannel}>
                            <Icon name="hash" size={48} color="#4F545C" />
                            <Text style={styles.emptyTitle}>Benvenuto in #{activeChannel?.name}!</Text>
                            <Text style={styles.emptySubtitle}>Questo è l'inizio del canale. I messaggi scadono dopo 48 ore.</Text>
                        </View>
                    )}
                    {currentMessages.map(msg => (
                        <MessageItem
                            key={msg.id}
                            msg={msg}
                            user={user}
                            socket={socket}
                            channelId={activeChannel?.id}
                            onReact={handleReact}
                            onPin={handlePin}
                        />
                    ))}
                </ScrollView>

                {/* Input */}
                <View style={styles.inputArea}>
                    <TouchableOpacity style={styles.inputActionBtn} onPress={handleImagePick}>
                        <Icon name="plus" size={18} color="#B5BAC1" />
                    </TouchableOpacity>

                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder={`Scrivi in #${activeChannel?.name}`}
                            placeholderTextColor="#72767D"
                            value={draft}
                            onChangeText={setDraft}
                            onSubmitEditing={() => sendMessage()}
                            returnKeyType="send"
                            blurOnSubmit={false}
                            multiline
                        />
                        <View style={styles.inputRight}>
                            <TouchableOpacity style={styles.inputIconBtn} onPress={handleImagePick}>
                                <Icon name="image" size={18} color="#B5BAC1" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.inputIconBtn} onPress={() => setEmojiPickerVisible(true)}>
                                <Icon name="smile" size={18} color="#B5BAC1" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>

            {/* Modals */}
            <EmojiPickerModal
                visible={emojiPickerVisible}
                onClose={() => setEmojiPickerVisible(false)}
                onSelect={(e) => sendMessage(e)}
            />
            <PinnedMessagesModal
                visible={pinnedModalVisible}
                onClose={() => setPinnedModalVisible(false)}
                messages={currentPinned}
            />
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1, flexDirection: 'row', backgroundColor: '#313338',
    },
    containerHidden: { display: 'none' },

    // Sidebar
    sidebar: {
        width: 240, backgroundColor: '#2B2D31',
        borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.25)',
        flexDirection: 'column',
    },
    sidebarHeader: {
        height: 48, paddingHorizontal: 16, justifyContent: 'center',
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.25)',
    },
    sidebarTitle: { color: '#FFF', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
    channelList: { flex: 1, paddingVertical: 8 },

    hotelHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 8,
    },
    hotelName: { color: '#8E9297', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

    channelItem: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4,
    },
    channelItemActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
    channelName: { color: '#8E9297', fontSize: 15, flex: 1 },
    channelNameActive: { color: '#DCDDDE', fontWeight: '500' },
    channelBadge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    channelBadgeText: { fontSize: 10, fontWeight: '700' },

    sidebarFooter: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, backgroundColor: '#1E1F22',
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.2)',
    },
    footerAvatar: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: '#5865F2',
        justifyContent: 'center', alignItems: 'center',
    },
    footerAvatarText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    footerUsername: { color: '#FFF', fontSize: 13, fontWeight: '600' },
    footerStation: { color: '#B5BAC1', fontSize: 11 },

    // Chat area
    chatArea: { flex: 1, flexDirection: 'column' },

    channelHeader: {
        height: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.25)',
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8,
    },
    channelHeaderName: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    channelHeaderHotel: { color: '#72767D', fontSize: 13 },
    headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
    headerBtnText: { color: '#D4AF37', fontSize: 12, fontWeight: '600' },
    expiryNote: { color: '#4F545C', fontSize: 10, marginLeft: 8 },

    messagesArea: { flex: 1 },
    messagesContent: { paddingVertical: 16, paddingHorizontal: 12 },

    emptyChannel: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle: { color: '#DCDDDE', fontSize: 22, fontWeight: '700' },
    emptySubtitle: { color: '#72767D', fontSize: 14, textAlign: 'center' },

    // Messages
    msgRow: { flexDirection: 'row', marginBottom: 2, paddingHorizontal: 4, alignItems: 'flex-start' },
    msgRowMine: { justifyContent: 'flex-end' },
    msgAvatar: {
        width: 38, height: 38, borderRadius: 19, backgroundColor: '#5865F2',
        justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2,
    },
    msgAvatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    msgBubble: { maxWidth: '72%', backgroundColor: 'transparent' },
    msgBubbleMine: { alignItems: 'flex-end' },
    msgHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    msgSender: { color: '#FFF', fontWeight: '600', fontSize: 14 },
    msgSenderMine: { color: '#D4AF37' },
    msgTime: { color: '#72767D', fontSize: 11 },
    msgText: { color: '#DCDDDE', fontSize: 15, lineHeight: 22 },
    msgImage: { width: 260, height: 180, borderRadius: 8, marginTop: 8 },
    reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
    reactionBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
        paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    reactionCount: { color: '#B5BAC1', fontSize: 12, fontWeight: '600' },
    expiryText: { color: '#FAA61A', fontSize: 10, marginTop: 4 },

    // Input area
    inputArea: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 16, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)',
        gap: 8,
    },
    inputActionBtn: {
        width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 50, marginBottom: 4,
    },
    inputWrapper: {
        flex: 1, backgroundColor: '#383A40', borderRadius: 8,
        flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 14,
    },
    input: {
        flex: 1, color: '#DCDDDE', fontSize: 15, paddingVertical: 10, maxHeight: 140,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    inputRight: { flexDirection: 'row', alignItems: 'center', paddingRight: 6, paddingBottom: 8, gap: 2 },
    inputIconBtn: { padding: 6 },

    // Emoji picker modal
    emojiOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end', alignItems: 'flex-start', padding: 20,
    },
    emojiModal: {
        width: 340, height: 440, backgroundColor: '#2B2D31',
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    emojiSearchRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        margin: 10, backgroundColor: '#1E1F22', borderRadius: 6, paddingHorizontal: 10,
    },
    emojiSearch: {
        flex: 1, color: '#DCDDDE', paddingVertical: 8, fontSize: 14,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    emojiTabs: { maxHeight: 36 },
    emojiTab: { paddingHorizontal: 12, paddingVertical: 8 },
    emojiTabActive: { borderBottomWidth: 2, borderBottomColor: '#D4AF37' },
    emojiTabText: { color: '#8E9297', fontSize: 12, fontWeight: '600' },
    emojiGrid: { flex: 1 },
    emojiGridContent: { padding: 8 },
    emojiRow: { flexDirection: 'row', flexWrap: 'wrap' },
    emojiItem: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
    emojiChar: { fontSize: 22 },

    // Context menu
    contextOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    contextMenu: {
        backgroundColor: '#2B2D31', borderRadius: 8, padding: 4, minWidth: 200,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    contextItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 4 },
    contextText: { color: '#DCDDDE', fontSize: 14 },

    // Pinned modal
    pinnedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    pinnedModal: {
        width: '90%', maxWidth: 420, height: '70%',
        backgroundColor: '#2B2D31', borderRadius: 10, overflow: 'hidden',
    },
    pinnedHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    pinnedTitle: { color: '#FFF', fontWeight: '700', fontSize: 15, flex: 1 },
    noPinnedText: { color: '#72767D', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
    pinnedItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    pinnedSender: { color: '#D4AF37', fontWeight: '700', marginBottom: 4 },
    pinnedText: { color: '#DCDDDE' },
});
