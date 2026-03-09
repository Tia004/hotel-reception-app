/**
 * HotelChat.js — v2.3.1
 * Hotel-management communication hub — unique warm navy/gold design.
 * Key fixes: send button + Enter key, "+" dropdown, recently-used emoji,
 * settings gear in footer, collapsible channels, unique design (not Discord).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, Image, Dimensions, Platform, Modal, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import MediaSettings from './MediaSettings';
import { EMOJI_CATEGORIES, ALL_EMOJI } from '../utils/emoji_data';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

// ─── Hotel structure ────────────────────────────────────────────────────────
const HOTELS = [
    {
        id: 'duchessa', name: 'Duchessa Isabella', color: '#C9A84C', icon: '🏛️',
        channels: [{ id: 'duchessa-generale', name: 'generale' }, { id: 'duchessa-media', name: 'media' }, { id: 'duchessa-annunci', name: 'annunci' }]
    },
    {
        id: 'blumen', name: 'Hotel Blumen', color: '#4CAF7D', icon: '🌿',
        channels: [{ id: 'blumen-generale', name: 'generale' }, { id: 'blumen-media', name: 'media' }, { id: 'blumen-annunci', name: 'annunci' }]
    },
    {
        id: 'santorsola', name: "Sant'Orsola", color: '#6B7FC4', icon: '⛪',
        channels: [{ id: 'santorsola-generale', name: 'generale' }, { id: 'santorsola-media', name: 'media' }, { id: 'santorsola-annunci', name: 'annunci' }]
    },
];
const ALL_CHANNELS = HOTELS.flatMap(h => h.channels);

// ─── Recently used emoji (persisted in localStorage) ───────────────────────
const getRecentEmoji = () => {
    try { return JSON.parse(localStorage.getItem('gsa_recent_emoji') || '[]'); } catch { return []; }
};
const saveRecentEmoji = (list) => {
    try { localStorage.setItem('gsa_recent_emoji', JSON.stringify(list)); } catch { }
};

// ─── Poll Creator Modal ────────────────────────────────────────────────────────
const PollModal = ({ visible, onClose, onSend }) => {
    const [question, setQuestion] = useState('');
    const [opts, setOpts] = useState(['', '']);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}><View style={styles.pollModal}>
                <Text style={styles.pollTitle}>Crea Sondaggio</Text>
                <Text style={styles.pollLabel}>DOMANDA</Text>
                <TextInput style={styles.pollInput} value={question} onChangeText={setQuestion} placeholder="Inserisci la domanda..." placeholderTextColor="#554E40" />
                <Text style={styles.pollLabel}>OPZIONI</Text>
                {opts.map((o, i) => (
                    <TextInput key={i} style={[styles.pollInput, { marginBottom: 8 }]} value={o}
                        onChangeText={v => setOpts(p => p.map((x, j) => j === i ? v : x))}
                        placeholder={`Opzione ${i + 1}`} placeholderTextColor="#554E40" />
                ))}
                <TouchableOpacity onPress={() => setOpts(p => [...p, ''])} style={styles.pollAddOpt}>
                    <Icon name="plus" size={14} color="#C9A84C" /><Text style={styles.pollAddOptText}>Aggiungi opzione</Text>
                </TouchableOpacity>
                <View style={styles.pollActions}>
                    <TouchableOpacity style={styles.pollCancel} onPress={onClose}><Text style={{ color: '#6E6960' }}>Annulla</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.pollSend} onPress={() => {
                        if (!question.trim()) return;
                        onSend({ question, options: opts.filter(Boolean) }); onClose(); setQuestion(''); setOpts(['', '']);
                    }}><Text style={{ color: '#111', fontWeight: '700' }}>Invia</Text></TouchableOpacity>
                </View>
            </View></View>
        </Modal>
    );
};

// ─── Emoji Picker ──────────────────────────────────────────────────────────
const EmojiPicker = ({ onSelect, onClose, style }) => {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState(-1); // -1 = all/recent, >=0 = category
    const [recentEmoji, setRecentEmoji] = useState(getRecentEmoji);

    const pickEmoji = (e) => {
        const updated = [e, ...recentEmoji.filter(x => x !== e)].slice(0, 24);
        setRecentEmoji(updated); saveRecentEmoji(updated);
        onSelect(e); onClose();
    };

    const searchResults = search
        ? ALL_EMOJI.filter((_, i) => {
            // Simple filter: show every emoji when searching (user sees all while typing)
            return true;
        }).filter((_, i) => i < 200)
        : null;

    return (
        <View style={[styles.emojiPicker, style]}>
            <View style={styles.emojiSearchRow}>
                <Icon name="search" size={13} color="#6E6960" />
                <TextInput style={styles.emojiSearchIn} placeholder="Cerca emoji..." placeholderTextColor="#6E6960"
                    value={search} onChangeText={setSearch} autoFocus={false}
                    {...(Platform.OS === 'web' ? { style: [styles.emojiSearchIn, { outlineStyle: 'none' }] } : {})} />
                {search ? <TouchableOpacity onPress={() => setSearch('')}><Icon name="x" size={13} color="#6E6960" /></TouchableOpacity> : null}
            </View>

            {!search && recentEmoji.length > 0 && (
                <>
                    <Text style={styles.emojiSection}>⏱ USATE DI RECENTE</Text>
                    <View style={styles.emojiGrid}>
                        {recentEmoji.map((e, i) => (
                            <TouchableOpacity key={i} style={styles.emojiCell} onPress={() => pickEmoji(e)}>
                                <Text style={styles.emojiChar}>{e}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.emojiDivider} />
                </>
            )}

            {/* Category tabs */}
            {!search && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiCatScroll}>
                    <TouchableOpacity onPress={() => setTab(-1)} style={[styles.emojiCatBtn, tab === -1 && styles.emojiCatBtnActive]}>
                        <Text style={styles.emojiCatLabel}>Tutte</Text>
                    </TouchableOpacity>
                    {EMOJI_CATEGORIES.map((c, i) => (
                        <TouchableOpacity key={i} onPress={() => setTab(i)} style={[styles.emojiCatBtn, tab === i && styles.emojiCatBtnActive]}>
                            <Text style={styles.emojiCatLabel}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            <ScrollView style={styles.emojiScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.emojiGrid}>
                    {(search ? ALL_EMOJI : tab >= 0 ? EMOJI_CATEGORIES[tab].emoji : ALL_EMOJI).map((e, i) => (
                        <TouchableOpacity key={i} style={styles.emojiCell} onPress={() => pickEmoji(e)}>
                            <Text style={styles.emojiChar}>{e}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

// ─── Pinned Messages Panel ─────────────────────────────────────────────────
const PinnedModal = ({ visible, onClose, messages }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}><View style={styles.pinnedModal}>
            <View style={styles.pinnedHeader}>
                <Icon name="bookmark" size={15} color="#C9A84C" />
                <Text style={styles.pinnedTitle}>Messaggi Fissati</Text>
                <TouchableOpacity onPress={onClose}><Icon name="x" size={17} color="#6E6960" /></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, padding: 14 }}>
                {messages.length === 0 && <Text style={styles.emptyText}>Nessun messaggio fissato.</Text>}
                {messages.map(m => (
                    <View key={m.id} style={styles.pinnedItem}>
                        <Text style={styles.pinnedSender}>{m.sender}</Text>
                        <Text style={styles.pinnedText} numberOfLines={3}>{m.text}</Text>
                    </View>
                ))}
            </ScrollView>
        </View></View>
    </Modal>
);

// ─── Message Item ─────────────────────────────────────────────────────────
const MessageItem = ({ msg, user, onPin, onReact }) => {
    const [ctx, setCtx] = useState(false);
    const [emojiMenu, setEmojiMenu] = useState(false);
    const isMine = msg.sender === user?.username;
    const time = new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const date = new Date(msg.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const hoursLeft = Math.max(0, Math.floor((msg.expiresAt - Date.now()) / 3600000));

    return (
        <TouchableOpacity onLongPress={() => setCtx(true)} activeOpacity={0.95} style={styles.msgRow}>
            <View style={styles.msgAvatarCol}>
                <View style={[styles.msgAvatar, isMine && styles.msgAvatarMine]}>
                    <Text style={styles.msgAvatarTxt}>{msg.sender?.charAt(0)?.toUpperCase()}</Text>
                </View>
            </View>
            <View style={styles.msgBody}>
                <View style={styles.msgMeta}>
                    <Text style={[styles.msgSender, isMine && { color: '#C9A84C' }]}>{msg.sender}</Text>
                    <Text style={styles.msgTime}>{date} {time}</Text>
                    {msg.pinned && <Icon name="bookmark" size={10} color="#C9A84C" style={{ marginLeft: 4 }} />}
                </View>
                {msg.text ? <Text style={styles.msgText}>{msg.text}</Text> : null}
                {msg.imageData && <Image source={{ uri: msg.imageData }} style={styles.msgImg} resizeMode="contain" />}
                {msg.gifUrl && <Image source={{ uri: msg.gifUrl }} style={styles.msgImg} resizeMode="contain" />}
                {msg.poll && (
                    <View style={styles.pollCard}>
                        <Text style={styles.pollQuestion}>{msg.poll.question}</Text>
                        {msg.poll.options?.map((o, i) => (
                            <View key={i} style={styles.pollOption}><Text style={styles.pollOptionText}>{o}</Text></View>
                        ))}
                    </View>
                )}
                {/* Reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <View style={styles.reactRow}>
                        {Object.entries(msg.reactions).map(([e, n]) => (
                            <TouchableOpacity key={e} style={styles.reactBadge} onPress={() => onReact(msg.id, e)}>
                                <Text>{e}</Text><Text style={styles.reactCount}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                {hoursLeft < 6 && <Text style={styles.expiring}>Scade tra {hoursLeft}h</Text>}
            </View>

            {/* Context menu */}
            <Modal visible={ctx} transparent animationType="fade" onRequestClose={() => setCtx(false)}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setCtx(false)}>
                    <View style={styles.ctxMenu}>
                        <TouchableOpacity style={styles.ctxItem} onPress={() => { setCtx(false); setEmojiMenu(true); }}>
                            <Icon name="smile" size={15} color="#C8C4B8" /><Text style={styles.ctxTxt}>Reagisci</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ctxItem} onPress={() => { setCtx(false); onPin(msg); }}>
                            <Icon name="bookmark" size={15} color="#C9A84C" />
                            <Text style={[styles.ctxTxt, { color: '#C9A84C' }]}>{msg.pinned ? 'Rimuovi pin' : 'Fissa'}</Text>
                        </TouchableOpacity>
                        {Platform.OS === 'web' && msg.text && (
                            <TouchableOpacity style={styles.ctxItem} onPress={() => { navigator.clipboard?.writeText(msg.text); setCtx(false); }}>
                                <Icon name="copy" size={15} color="#C8C4B8" /><Text style={styles.ctxTxt}>Copia</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
            {emojiMenu && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setEmojiMenu(false)}>
                    <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setEmojiMenu(false)}>
                        <TouchableOpacity activeOpacity={1}>
                            <EmojiPicker onSelect={(e) => { onReact(msg.id, e); setEmojiMenu(false); }} onClose={() => setEmojiMenu(false)} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}
        </TouchableOpacity>
    );
};

// ─── Main HotelChat ──────────────────────────────────────────────────────
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar }) {
    const [activeChannel, setActiveChannel] = useState(HOTELS[0].channels[0]);
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [expanded, setExpanded] = useState({ duchessa: true, blumen: false, santorsola: false });
    const [draft, setDraft] = useState('');

    // UI panels
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [pinnedModalVisible, setPinnedModalVisible] = useState(false);
    const [plusMenuVisible, setPlusMenuVisible] = useState(false);
    const [pollModalVisible, setPollModalVisible] = useState(false);
    const inputRef = useRef(null);
    const scrollRef = useRef(null);

    // ── Socket listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        ALL_CHANNELS.forEach(ch => {
            socket.emit('join-channel', { channelId: ch.id });
            socket.emit('get-channel-history', { channelId: ch.id });
        });

        const onHistory = ({ channelId, messages: msgs, pinned: pins }) => {
            setMessages(p => ({ ...p, [channelId]: msgs }));
            setPinned(p => ({ ...p, [channelId]: pins }));
        };
        const onMsg = ({ channelId, message }) => {
            setMessages(p => ({ ...p, [channelId]: [...(p[channelId] || []), message] }));
            if (channelId === activeChannel?.id) {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
            }
        };
        const onPinned = ({ channelId, message }) => {
            setPinned(p => { const e = p[channelId] || []; return e.find(m => m.id === message.id) ? p : { ...p, [channelId]: [...e, message] }; });
            setMessages(p => ({ ...p, [channelId]: (p[channelId] || []).map(m => m.id === message.id ? { ...m, pinned: true } : m) }));
        };
        const onUnpinned = ({ channelId, messageId }) => {
            setPinned(p => ({ ...p, [channelId]: (p[channelId] || []).filter(m => m.id !== messageId) }));
            setMessages(p => ({ ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, pinned: false } : m) }));
        };
        const onReaction = ({ channelId, messageId, emoji, count }) => {
            setMessages(p => ({ ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, reactions: { ...m.reactions, [emoji]: count } } : m) }));
        };

        socket.on('channel-history', onHistory);
        socket.on('channel-message', onMsg);
        socket.on('message-pinned', onPinned);
        socket.on('message-unpinned', onUnpinned);
        socket.on('channel-reaction-update', onReaction);

        return () => {
            socket.off('channel-history', onHistory);
            socket.off('channel-message', onMsg);
            socket.off('message-pinned', onPinned);
            socket.off('message-unpinned', onUnpinned);
            socket.off('channel-reaction-update', onReaction);
        };
    }, [socket, activeChannel?.id]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }, [messages[activeChannel?.id]]);

    // ── Actions ─────────────────────────────────────────────────────────
    const send = (text = null, imageData = null, gifUrl = null, poll = null) => {
        const content = text !== null ? text : draft.trim();
        if (!content && !imageData && !gifUrl && !poll) return;
        if (!socket || !activeChannel) return;
        socket.emit('channel-message', { channelId: activeChannel.id, text: content || '', imageData, gifUrl, poll });
        setDraft('');
        inputRef.current?.focus();
    };

    const handleKeyPress = (e) => {
        if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
            e.preventDefault?.();
            send();
        }
    };

    const pickFile = () => {
        if (Platform.OS !== 'web') return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = (ev) => {
            const file = ev.target.files[0]; if (!file) return;
            const r = new FileReader();
            r.onload = (e) => send('', e.target.result, null);
            r.readAsDataURL(file);
        };
        input.click();
    };

    const pin = (msg) => {
        if (!socket) return;
        socket.emit(msg.pinned ? 'unpin-message' : 'pin-message', { channelId: activeChannel.id, messageId: msg.id });
    };
    const react = (messageId, emoji) => {
        if (!socket) return;
        socket.emit('channel-reaction', { channelId: activeChannel.id, messageId, emoji });
    };

    const currentMsgs = (messages[activeChannel?.id] || []).filter(m => m.expiresAt > Date.now());
    const currentPinned = pinned[activeChannel?.id] || [];
    const activeHotel = HOTELS.find(h => h.channels.some(c => c.id === activeChannel?.id));

    return (
        <View style={styles.root}>
            {/* ── Sidebar ───────────────────────────────────────────────── */}
            {(sidebarVisible || !IS_MOBILE) && (
                <View style={styles.sidebar}>
                    {/* Brand header */}
                    <LinearGradient colors={['#1C1A12', '#141210']} style={styles.sidebarHeader}>
                        <Text style={styles.brandName}>GSA HOTELS</Text>
                        <Text style={styles.brandSub}>COMUNICAZIONI</Text>
                    </LinearGradient>

                    {/* Channel tree */}
                    <ScrollView style={styles.channelTree} showsVerticalScrollIndicator={false}>
                        {HOTELS.map(hotel => (
                            <View key={hotel.id}>
                                <TouchableOpacity
                                    style={styles.hotelRow}
                                    onPress={() => setExpanded(p => ({ ...p, [hotel.id]: !p[hotel.id] }))}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.hotelDot, { backgroundColor: hotel.color }]} />
                                    <Text style={styles.hotelLbl}>{hotel.name.toUpperCase()}</Text>
                                    <Icon name={expanded[hotel.id] ? 'chevron-down' : 'chevron-right'} size={11} color="#554E40" />
                                </TouchableOpacity>
                                {expanded[hotel.id] && hotel.channels.map(ch => {
                                    const active = activeChannel?.id === ch.id;
                                    return (
                                        <TouchableOpacity
                                            key={ch.id}
                                            style={[styles.chRow, active && styles.chRowActive, active && { borderLeftColor: hotel.color }]}
                                            onPress={() => { setActiveChannel(ch); if (IS_MOBILE) onToggleSidebar?.(); }}
                                            activeOpacity={0.8}
                                        >
                                            <Icon name="hash" size={14} color={active ? hotel.color : '#554E40'} />
                                            <Text style={[styles.chName, active && { color: hotel.color }]}>{ch.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </ScrollView>

                    {/* Footer — user + settings */}
                    <View style={styles.sidebarFooter}>
                        <View style={styles.footerAvatar}>
                            <Text style={styles.footerAvatarTxt}>{user?.username?.charAt(0)?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.footerName}>{user?.username}</Text>
                            <Text style={styles.footerStation}>{user?.station}</Text>
                        </View>
                        <TouchableOpacity style={styles.footerGear} onPress={() => setSettingsVisible(true)}>
                            <Icon name="settings" size={17} color="#554E40" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── Chat Area ──────────────────────────────────────────────── */}
            <View style={styles.chatArea}>
                {/* Header */}
                <View style={styles.chatHeader}>
                    {IS_MOBILE && (
                        <TouchableOpacity onPress={onToggleSidebar} style={{ marginRight: 10 }}>
                            <Icon name="menu" size={19} color="#C8C4B8" />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.headerDot, { backgroundColor: activeHotel?.color || '#C9A84C' }]} />
                    <Icon name="hash" size={17} color="#C8C4B8" />
                    <Text style={styles.headerChName}>{activeChannel?.name}</Text>
                    <Text style={styles.headerHotel}>• {activeHotel?.name}</Text>
                    <View style={{ flex: 1 }} />
                    {currentPinned.length > 0 && (
                        <TouchableOpacity onPress={() => setPinnedModalVisible(true)} style={styles.headerAction}>
                            <Icon name="bookmark" size={16} color="#C9A84C" />
                            <Text style={styles.headerActionTxt}>{currentPinned.length}</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={styles.expiryNote}>Msg · 48h</Text>
                </View>

                {/* Messages */}
                <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesPad} showsVerticalScrollIndicator={false}>
                    {currentMsgs.length === 0 && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>#{activeChannel?.name[0]}</Text>
                            <Text style={styles.emptyTitle}>#{activeChannel?.name}</Text>
                            <Text style={styles.emptyDesc}>Nessun messaggio. Inizia la conversazione qui.</Text>
                        </View>
                    )}
                    {currentMsgs.map(msg => (
                        <MessageItem key={msg.id} msg={msg} user={user} onPin={pin} onReact={react} />
                    ))}
                </ScrollView>

                {/* Input bar */}
                <View style={styles.inputBar}>
                    {/* Plus button */}
                    <View style={{ position: 'relative' }}>
                        <TouchableOpacity style={styles.plusBtn} onPress={() => setPlusMenuVisible(v => !v)} activeOpacity={0.8}>
                            <Icon name="plus" size={18} color="#C8C4B8" />
                        </TouchableOpacity>
                        {plusMenuVisible && (
                            <View style={styles.plusMenu}>
                                <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusMenuVisible(false); pickFile(); }}>
                                    <Icon name="image" size={15} color="#C9A84C" />
                                    <Text style={styles.plusItemTxt}>Invia file / immagine</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusMenuVisible(false); setPollModalVisible(true); }}>
                                    <Icon name="check" size={15} color="#4CAF7D" />
                                    <Text style={styles.plusItemTxt}>Crea sondaggio</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Text input */}
                    <View style={styles.inputWrap}>
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholder={`Scrivi in #${activeChannel?.name}...`}
                            placeholderTextColor="#554E40"
                            value={draft}
                            onChangeText={setDraft}
                            onKeyPress={handleKeyPress}
                            returnKeyType="send"
                            blurOnSubmit={false}
                            multiline
                        />
                    </View>

                    {/* Right actions */}
                    <TouchableOpacity style={styles.inputAction} onPress={() => setEmojiPickerVisible(v => !v)}>
                        <Icon name="smile" size={18} color={emojiPickerVisible ? '#C9A84C' : '#C8C4B8'} />
                    </TouchableOpacity>

                    {/* Send button */}
                    <TouchableOpacity style={[styles.sendBtn, draft.trim() && styles.sendBtnActive]} onPress={() => send()} activeOpacity={0.85}>
                        <Icon name="send" size={15} color={draft.trim() ? '#111' : '#554E40'} />
                    </TouchableOpacity>
                </View>

                {/* Emoji picker panel */}
                {emojiPickerVisible && (
                    <View style={styles.emojiPanelWrap}>
                        <EmojiPicker
                            onSelect={(e) => { setDraft(d => d + e); }}
                            onClose={() => setEmojiPickerVisible(false)}
                        />
                    </View>
                )}
            </View>

            {/* Modals */}
            <PollModal visible={pollModalVisible} onClose={() => setPollModalVisible(false)} onSend={(poll) => send('', null, null, poll)} />
            <PinnedModal visible={pinnedModalVisible} onClose={() => setPinnedModalVisible(false)} messages={currentPinned} />
            <MediaSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} user={user} />
        </View>
    );
}

// ─── Styles — Warm Navy/Gold hotel theme ───────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: '#141210' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },

    // Sidebar
    sidebar: { width: IS_MOBILE ? '100%' : 230, backgroundColor: '#100E0C', flexDirection: 'column', borderRightWidth: 1, borderRightColor: 'rgba(201,168,76,0.08)' },
    sidebarHeader: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
    brandName: { color: '#C9A84C', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
    brandSub: { color: '#554E40', fontSize: 9, letterSpacing: 2, marginTop: 2 },

    channelTree: { flex: 1, paddingVertical: 10 },
    hotelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9 },
    hotelDot: { width: 7, height: 7, borderRadius: 3.5 },
    hotelLbl: { flex: 1, color: '#6E6960', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
    chRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 8, marginVertical: 1, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: 'transparent' },
    chRowActive: { backgroundColor: 'rgba(201,168,76,0.07)' },
    chName: { color: '#6E6960', fontSize: 14 },

    sidebarFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#0C0B09', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' },
    footerAvatar: { width: 33, height: 33, borderRadius: 16.5, backgroundColor: '#2A2217', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', justifyContent: 'center', alignItems: 'center' },
    footerAvatarTxt: { color: '#C9A84C', fontWeight: '700', fontSize: 14 },
    footerName: { color: '#C8C4B8', fontSize: 13, fontWeight: '600' },
    footerStation: { color: '#554E40', fontSize: 10 },
    footerGear: { padding: 6, borderRadius: 6 },

    // Chat area
    chatArea: { flex: 1, flexDirection: 'column', backgroundColor: '#141210' },
    chatHeader: { height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)', backgroundColor: '#141210' },
    headerDot: { width: 8, height: 8, borderRadius: 4 },
    headerChName: { color: '#C8C4B8', fontWeight: '700', fontSize: 14 },
    headerHotel: { color: '#554E40', fontSize: 12 },
    headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerActionTxt: { color: '#C9A84C', fontSize: 11, fontWeight: '700' },
    expiryNote: { color: '#3A3630', fontSize: 10, marginLeft: 6 },

    messages: { flex: 1 },
    messagesPad: { paddingVertical: 12, paddingHorizontal: 14 },
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyIcon: { fontSize: 42, color: '#2A2520' },
    emptyTitle: { color: '#C8C4B8', fontSize: 18, fontWeight: '700' },
    emptyDesc: { color: '#554E40', fontSize: 13 },
    emptyText: { color: '#554E40', textAlign: 'center', marginTop: 30, fontStyle: 'italic' },

    // Message rows
    msgRow: { flexDirection: 'row', gap: 10, paddingVertical: 4, alignItems: 'flex-start' },
    msgAvatarCol: {},
    msgAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2217', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
    msgAvatarMine: { borderColor: 'rgba(201,168,76,0.5)' },
    msgAvatarTxt: { color: '#C9A84C', fontWeight: '700', fontSize: 15 },
    msgBody: { flex: 1 },
    msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
    msgSender: { color: '#C8C4B8', fontWeight: '700', fontSize: 13 },
    msgTime: { color: '#3A3630', fontSize: 10 },
    msgText: { color: '#A8A090', fontSize: 14, lineHeight: 21 },
    msgImg: { width: 240, height: 160, borderRadius: 6, marginTop: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    reactRow: { flexDirection: 'row', gap: 4, marginTop: 5, flexWrap: 'wrap' },
    reactBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    reactCount: { color: '#C9A84C', fontSize: 11, fontWeight: '600' },
    expiring: { color: '#A06A20', fontSize: 10, marginTop: 3 },

    // Poll card
    pollCard: { backgroundColor: '#1C1A12', borderRadius: 6, padding: 12, marginTop: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)', gap: 6 },
    pollQuestion: { color: '#C8C4B8', fontWeight: '700', fontSize: 13 },
    pollOption: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7 },
    pollOptionText: { color: '#A8A090', fontSize: 13 },

    // Input bar
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)', gap: 8, backgroundColor: '#141210' },
    plusBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    plusMenu: { position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, backgroundColor: '#1A1812', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)', minWidth: 220, zIndex: 99 },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
    plusItemTxt: { color: '#C8C4B8', fontSize: 14 },
    inputWrap: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    input: { color: '#C8C4B8', fontSize: 14, maxHeight: 120, paddingVertical: 7, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
    inputAction: { padding: 7, marginBottom: 2 },
    sendBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    sendBtnActive: { backgroundColor: '#C9A84C' },

    // Emoji
    emojiPanelWrap: { borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' },
    emojiPicker: { backgroundColor: '#0E0D0C', borderRadius: 0, height: 300 },
    emojiSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, backgroundColor: '#1C1A12', borderRadius: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    emojiSearchIn: { flex: 1, color: '#C8C4B8', paddingVertical: 7, fontSize: 13 },
    emojiSection: { color: '#554E40', fontSize: 9, letterSpacing: 2, paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
    emojiCell: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
    emojiChar: { fontSize: 22 },
    emojiDivider: { height: 1, backgroundColor: 'rgba(201,168,76,0.06)', marginHorizontal: 12, marginVertical: 6 },
    emojiCatScroll: { paddingHorizontal: 8, maxHeight: 30 },
    emojiCatBtn: { paddingHorizontal: 10, paddingVertical: 5, marginRight: 2 },
    emojiCatBtnActive: { borderBottomWidth: 2, borderBottomColor: '#C9A84C' },
    emojiCatLabel: { color: '#554E40', fontSize: 10, fontWeight: '700' },
    emojiScrollArea: { flex: 1 },

    // Context menu
    ctxMenu: { backgroundColor: '#1A1812', borderRadius: 8, padding: 4, minWidth: 190, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 4 },
    ctxTxt: { color: '#C8C4B8', fontSize: 13 },

    // Pinned modal
    pinnedModal: { width: '90%', maxWidth: 400, height: '60%', backgroundColor: '#1A1812', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.08)' },
    pinnedTitle: { color: '#C8C4B8', fontSize: 14, fontWeight: '700', flex: 1 },
    pinnedItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    pinnedSender: { color: '#C9A84C', fontWeight: '700', fontSize: 12, marginBottom: 4 },
    pinnedText: { color: '#A8A090', fontSize: 13 },

    // Poll modal
    pollModal: { width: '90%', maxWidth: 380, backgroundColor: '#1A1812', borderRadius: 10, padding: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    pollTitle: { color: '#C8C4B8', fontWeight: '700', fontSize: 16, marginBottom: 4 },
    pollLabel: { color: '#554E40', fontSize: 9, letterSpacing: 2, fontWeight: '700' },
    pollInput: { backgroundColor: '#0E0D0C', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, color: '#C8C4B8', fontSize: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
    pollAddOpt: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pollAddOptText: { color: '#C9A84C', fontSize: 13 },
    pollActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
    pollCancel: { paddingHorizontal: 14, paddingVertical: 9 },
    pollSend: { backgroundColor: '#C9A84C', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 6 },
});
