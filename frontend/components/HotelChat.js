/**
 * HotelChat.js — v2.4.0
 * Full overhaul: bubble messages (WhatsApp/Telegram style), UserProfileCard,
 * ImageLightbox, voice rooms in sidebar, saved call chats, poll fix,
 * non-selectable UI, bigger fonts, gold/black theme everywhere.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, Image, Dimensions, Platform, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import MediaSettings from './MediaSettings';
import UserProfileCard from './UserProfileCard';
import ImageLightbox from './ImageLightbox';
import { EMOJI_CATEGORIES, ALL_EMOJI } from '../utils/emoji_data';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

// ─── Helper: non-selectable on web ─────────────────────────────────────────
const NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none' } : {};
const YES_SELECT = Platform.OS === 'web' ? { userSelect: 'text' } : {};

// ─── Hotel structure ─────────────────────────────────────────────────────────
const HOTELS = [
    {
        id: 'duchessa', name: 'Duchessa Isabella', color: '#C9A84C', icon: 'hash',
        channels: [{ id: 'duchessa-generale', name: 'generale' }, { id: 'duchessa-media', name: 'media' }, { id: 'duchessa-annunci', name: 'annunci' }]
    },
    {
        id: 'blumen', name: 'Hotel Blumen', color: '#4CAF7D', icon: 'hash',
        channels: [{ id: 'blumen-generale', name: 'generale' }, { id: 'blumen-media', name: 'media' }, { id: 'blumen-annunci', name: 'annunci' }]
    },
    {
        id: 'santorsola', name: "Sant'Orsola", color: '#6B7FC4', icon: 'hash',
        channels: [{ id: 'santorsola-generale', name: 'generale' }, { id: 'santorsola-media', name: 'media' }, { id: 'santorsola-annunci', name: 'annunci' }]
    },
];
const ALL_CHANNELS = HOTELS.flatMap(h => h.channels);

// ─── Recently used emoji ────────────────────────────────────────────────────
const getRecentEmoji = () => { try { return JSON.parse(localStorage.getItem('gsa_recent_emoji') || '[]'); } catch { return []; } };
const saveRecentEmoji = (l) => { try { localStorage.setItem('gsa_recent_emoji', JSON.stringify(l)); } catch { } };

// ─── Saved call chats ───────────────────────────────────────────────────────
const getSavedChats = () => { try { return JSON.parse(localStorage.getItem('gsa_call_history') || '[]'); } catch { return []; } };

// ─── Emoji Picker ─────────────────────────────────────────────────────────
const EmojiPicker = ({ onSelect, onClose }) => {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState(-1);
    const [recent, setRecent] = useState(getRecentEmoji);

    const pick = (e) => {
        const u = [e, ...recent.filter(x => x !== e)].slice(0, 24);
        setRecent(u); saveRecentEmoji(u); onSelect(e); onClose();
    };
    const list = search ? ALL_EMOJI.filter((_, i) => i < 200) : (tab >= 0 ? EMOJI_CATEGORIES[tab].emoji : ALL_EMOJI);

    return (
        <View style={styles.emojiPicker}>
            <View style={styles.emojiSearchRow}>
                <Icon name="search" size={14} color="#6E6960" />
                <TextInput style={[styles.emojiSearchIn, NO_SELECT]} placeholder="Cerca emoji..." placeholderTextColor="#6E6960"
                    value={search} onChangeText={setSearch}
                    {...(Platform.OS === 'web' ? { style: [styles.emojiSearchIn, { outlineStyle: 'none' }] } : {})} />
                {!!search && <TouchableOpacity onPress={() => setSearch('')}><Icon name="x" size={13} color="#6E6960" /></TouchableOpacity>}
            </View>
            {!search && recent.length > 0 && (
                <><Text style={styles.emojiSectionLabel}>⏱ RECENTI</Text>
                    <View style={styles.emojiGrid}>{recent.map((e, i) => <TouchableOpacity key={i} style={styles.emojiCell} onPress={() => pick(e)}><Text style={styles.emojiChar}>{e}</Text></TouchableOpacity>)}</View>
                    <View style={styles.emojiDivider} /></>
            )}
            {!search && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiCatScroll}>
                    {[{ name: 'Tutte' }, ...EMOJI_CATEGORIES].map((c, i) => (
                        <TouchableOpacity key={i} onPress={() => setTab(i - 1)} style={[styles.emojiCatBtn, tab === i - 1 && styles.emojiCatBtnActive]}>
                            <Text style={styles.emojiCatLabel}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
            <ScrollView style={styles.emojiScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.emojiGrid}>{list.map((e, i) => <TouchableOpacity key={i} style={styles.emojiCell} onPress={() => pick(e)}><Text style={styles.emojiChar}>{e}</Text></TouchableOpacity>)}</View>
            </ScrollView>
        </View>
    );
};

// ─── Poll Creator Modal ──────────────────────────────────────────────────
const PollModal = ({ visible, onClose, onSend }) => {
    const [q, setQ] = useState('');
    const [opts, setOpts] = useState(['', '']);
    const reset = () => { setQ(''); setOpts(['', '']); };
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.pollModal}>
                    <Text style={[styles.pollTitle, NO_SELECT]}>Crea Sondaggio</Text>
                    <Text style={[styles.pollLabel, NO_SELECT]}>DOMANDA</Text>
                    <TextInput style={styles.pollInput} value={q} onChangeText={setQ} placeholder="Inserisci la domanda..." placeholderTextColor="#554E40"
                        {...(Platform.OS === 'web' ? { style: [styles.pollInput, { outlineStyle: 'none' }] } : {})} />
                    <Text style={[styles.pollLabel, NO_SELECT]}>OPZIONI</Text>
                    {opts.map((o, i) => (
                        <TextInput key={i} style={[styles.pollInput, { marginBottom: 8, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }]}
                            value={o} onChangeText={v => setOpts(p => p.map((x, j) => j === i ? v : x))}
                            placeholder={`Opzione ${i + 1}`} placeholderTextColor="#554E40" />
                    ))}
                    <TouchableOpacity onPress={() => setOpts(p => [...p, ''])} style={styles.pollAddOpt}>
                        <Icon name="plus" size={14} color="#C9A84C" /><Text style={[styles.pollAddOptText, NO_SELECT]}>Aggiungi opzione</Text>
                    </TouchableOpacity>
                    <View style={styles.pollActions}>
                        <TouchableOpacity style={styles.pollCancel} onPress={() => { onClose(); reset(); }}><Text style={[{ color: '#6E6960' }, NO_SELECT]}>Annulla</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.pollSend} onPress={() => {
                            const validOpts = opts.filter(Boolean);
                            if (!q.trim() || validOpts.length < 2) {
                                alert('Inserisci una domanda e almeno 2 opzioni'); return;
                            }
                            onSend({ question: q.trim(), options: validOpts });
                            onClose(); reset();
                        }}><Text style={[{ color: '#111', fontWeight: '700' }, NO_SELECT]}>Invia</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
};

// ─── Pinned Modal ────────────────────────────────────────────────────────
const PinnedModal = ({ visible, onClose, msgs }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
            <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.pinnedModal}>
                <View style={styles.pinnedHeader}>
                    <Icon name="bookmark" size={16} color="#C9A84C" />
                    <Text style={[styles.pinnedTitle, NO_SELECT]}>Messaggi Fissati</Text>
                    <TouchableOpacity onPress={onClose}><Icon name="x" size={17} color="#6E6960" /></TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1, padding: 14 }}>
                    {msgs.length === 0 && <Text style={[styles.emptyText, NO_SELECT]}>Nessun messaggio fissato.</Text>}
                    {msgs.map(m => (
                        <View key={m.id} style={styles.pinnedItem}>
                            <Text style={[styles.pinnedSender, NO_SELECT]}>{m.sender}</Text>
                            <Text style={[styles.pinnedText, YES_SELECT]}>{m.text}</Text>
                        </View>
                    ))}
                </ScrollView>
            </TouchableOpacity>
        </TouchableOpacity>
    </Modal>
);

// ─── Message Bubble ──────────────────────────────────────────────────────
const MessageBubble = ({ msg, user, onPin, onReact, onImageOpen }) => {
    const [ctx, setCtx] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const isMine = msg.sender === user?.username;
    const time = new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const date = new Date(msg.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const expire = Math.max(0, Math.floor((msg.expiresAt - Date.now()) / 3600000));

    return (
        <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
            {/* Avatar — only for others */}
            {!isMine && (
                <View style={styles.bubbleAvatar}>
                    <Text style={styles.bubbleAvatarTxt}>{msg.sender?.charAt(0)?.toUpperCase()}</Text>
                </View>
            )}

            <View style={[styles.bubbleCol, isMine && styles.bubbleColMine]}>
                {/* Sender name — only for others */}
                {!isMine && <Text style={[styles.bubbleSender, NO_SELECT]}>{msg.sender}</Text>}

                {/* Bubble */}
                <TouchableOpacity
                    onLongPress={() => setCtx(true)}
                    activeOpacity={0.92}
                    style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
                >
                    {msg.text ? <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine, YES_SELECT]}>{msg.text}</Text> : null}

                    {(msg.imageData || msg.gifUrl) && (
                        <TouchableOpacity onPress={() => onImageOpen(msg.imageData || msg.gifUrl)}>
                            <Image source={{ uri: msg.imageData || msg.gifUrl }} style={styles.bubbleImg} resizeMode="cover" />
                        </TouchableOpacity>
                    )}

                    {msg.poll && (
                        <View style={styles.pollCard}>
                            <Text style={[styles.pollQuestion, NO_SELECT]}>{msg.poll.question}</Text>
                            {msg.poll.options?.map((o, i) => (
                                <View key={i} style={styles.pollOption}>
                                    <Text style={[styles.pollOptionText, YES_SELECT]}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Meta line */}
                    <View style={[styles.bubbleMeta, isMine && { justifyContent: 'flex-end' }]}>
                        {msg.pinned && <Icon name="bookmark" size={10} color={isMine ? 'rgba(201,168,76,0.8)' : '#C9A84C'} />}
                        <Text style={[styles.bubbleTime, isMine && { color: 'rgba(201,168,76,0.7)' }]}>{date}, {time}</Text>
                        {isMine && <Icon name="check" size={12} color="rgba(201,168,76,0.7)" />}
                    </View>
                </TouchableOpacity>

                {/* Reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <View style={[styles.reactRow, isMine && { justifyContent: 'flex-end' }]}>
                        {Object.entries(msg.reactions).map(([e, n]) => (
                            <TouchableOpacity key={e} style={styles.reactBadge} onPress={() => onReact(msg.id, e)}>
                                <Text style={{ fontSize: 14 }}>{e}</Text>
                                <Text style={styles.reactCount}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {expire < 6 && <Text style={[styles.expiring, NO_SELECT]}>Scade tra {expire}h</Text>}
            </View>

            {/* Context menu */}
            <Modal visible={ctx} transparent animationType="fade" onRequestClose={() => setCtx(false)}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setCtx(false)}>
                    <View style={styles.ctxMenu}>
                        <TouchableOpacity style={styles.ctxItem} onPress={() => { setCtx(false); setEmojiOpen(true); }}>
                            <Icon name="smile" size={16} color="#C8C4B8" /><Text style={[styles.ctxTxt, NO_SELECT]}>Reagisci</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ctxItem} onPress={() => { setCtx(false); onPin(msg); }}>
                            <Icon name="bookmark" size={16} color="#C9A84C" />
                            <Text style={[styles.ctxTxt, { color: '#C9A84C' }, NO_SELECT]}>{msg.pinned ? 'Rimuovi pin' : 'Fissa'}</Text>
                        </TouchableOpacity>
                        {Platform.OS === 'web' && msg.text && (
                            <TouchableOpacity style={styles.ctxItem} onPress={() => { navigator.clipboard?.writeText(msg.text); setCtx(false); }}>
                                <Icon name="copy" size={16} color="#C8C4B8" /><Text style={[styles.ctxTxt, NO_SELECT]}>Copia testo</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
            {emojiOpen && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setEmojiOpen(false)}>
                    <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setEmojiOpen(false)}>
                        <TouchableOpacity activeOpacity={1} onPress={() => { }} style={{ borderRadius: 12, overflow: 'hidden' }}>
                            <EmojiPicker onSelect={(e) => { onReact(msg.id, e); setEmojiOpen(false); }} onClose={() => setEmojiOpen(false)} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}
        </View>
    );
};

// ─── Main HotelChat ──────────────────────────────────────────────────────
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar, availableRooms = [], onJoinRoom }) {
    const SPECIAL_SAVED = '__saved__';
    const [activeChannel, setActiveChannel] = useState(HOTELS[0].channels[0]);
    const [savedChatIndex, setSavedChatIndex] = useState(null); // if viewing a saved chat
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [expanded, setExpanded] = useState({ duchessa: true, blumen: false, santorsola: false, voice: true, saved: false });
    const [draft, setDraft] = useState('');
    const [savedChats] = useState(getSavedChats);

    // UI
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [profileVisible, setProfileVisible] = useState(false);
    const [emojiVisible, setEmojiVisible] = useState(false);
    const [pinnedVisible, setPinnedVisible] = useState(false);
    const [plusVisible, setPlusVisible] = useState(false);
    const [pollVisible, setPollVisible] = useState(false);
    // Image lightbox
    const [lightboxImages, setLightboxImages] = useState([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [lightboxVisible, setLightboxVisible] = useState(false);
    const inputRef = useRef(null);
    const scrollRef = useRef(null);

    // ── Socket ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        ALL_CHANNELS.forEach(ch => {
            socket.emit('join-channel', { channelId: ch.id });
            socket.emit('get-channel-history', { channelId: ch.id });
        });
        const onHistory = ({ channelId, messages: msgs, pinned: pins }) => {
            setMessages(p => ({ ...p, [channelId]: msgs }));
            setPinned(p => ({ ...p, [channelId]: pins || [] }));
        };
        const onMsg = ({ channelId, message }) => {
            setMessages(p => ({ ...p, [channelId]: [...(p[channelId] || []), message] }));
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
    }, [socket]);

    useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80); }, [messages[activeChannel?.id], activeChannel]);

    // ── Actions ────────────────────────────────────────────────────────
    const send = (text = null, imageData = null, gifUrl = null, poll = null) => {
        const content = text !== null ? text : draft.trim();
        if (!content && !imageData && !gifUrl && !poll) return;
        if (!socket || !activeChannel || savedChatIndex !== null) return;
        socket.emit('channel-message', { channelId: activeChannel.id, text: content || '', imageData: imageData || null, gifUrl: gifUrl || null, poll: poll || null });
        setDraft('');
        inputRef.current?.focus();
    };

    const handleKey = (e) => {
        if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
            e.preventDefault?.(); send();
        }
    };

    const pickFile = () => {
        if (Platform.OS !== 'web') return;
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = (ev) => {
            const file = ev.target.files[0]; if (!file) return;
            const r = new FileReader(); r.onload = (e) => send('', e.target.result); r.readAsDataURL(file);
        };
        inp.click();
    };

    const pin = (msg) => { if (!socket) return; socket.emit(msg.pinned ? 'unpin-message' : 'pin-message', { channelId: activeChannel.id, messageId: msg.id }); };
    const react = (messageId, emoji) => { if (!socket) return; socket.emit('channel-reaction', { channelId: activeChannel.id, messageId, emoji }); };

    const openImage = (url) => {
        // Collect all images in current channel for lightbox navigation
        const allImgs = (currentMsgs).filter(m => m.imageData || m.gifUrl).map(m => m.imageData || m.gifUrl);
        const idx = allImgs.indexOf(url);
        setLightboxImages(allImgs.length ? allImgs : [url]);
        setLightboxIndex(idx >= 0 ? idx : 0);
        setLightboxVisible(true);
    };

    // Current data
    const isViewingSaved = savedChatIndex !== null;
    const currentMsgs = isViewingSaved
        ? (savedChats[savedChatIndex]?.messages || [])
        : (messages[activeChannel?.id] || []).filter(m => m.expiresAt > Date.now());
    const currentPinned = pinned[activeChannel?.id] || [];
    const activeHotel = HOTELS.find(h => h.channels.some(c => c.id === activeChannel?.id));
    const channelLabel = isViewingSaved ? `Chiamata del ${new Date(savedChats[savedChatIndex]?.date).toLocaleDateString('it-IT')}` : `#${activeChannel?.name}`;
    const hotelLabel = isViewingSaved ? 'Chat salvata' : activeHotel?.name;

    // ── Render ──────────────────────────────────────────────────────────
    return (
        <View style={[styles.root, NO_SELECT]}>

            {/* ── SIDEBAR ────────────────────────────────────────────────── */}
            {(sidebarVisible || !IS_MOBILE) && (
                <View style={styles.sidebar}>
                    {/* Brand */}
                    <LinearGradient colors={['#1C1A12', '#141210']} style={styles.sidebarHeader}>
                        <Text style={styles.brandName}>GSA HOTELS</Text>
                        <Text style={styles.brandSub}>COMUNICAZIONI</Text>
                    </LinearGradient>

                    <ScrollView style={styles.channelTree} showsVerticalScrollIndicator={false}>
                        {/* Hotels & channels */}
                        {HOTELS.map(hotel => (
                            <View key={hotel.id}>
                                <TouchableOpacity style={styles.hotelRow} onPress={() => setExpanded(p => ({ ...p, [hotel.id]: !p[hotel.id] }))}>
                                    <View style={[styles.hotelDot, { backgroundColor: hotel.color }]} />
                                    <Text style={styles.hotelLbl}>{hotel.name.toUpperCase()}</Text>
                                    <Icon name={expanded[hotel.id] ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded[hotel.id] && hotel.channels.map(ch => {
                                    const active = !isViewingSaved && activeChannel?.id === ch.id;
                                    return (
                                        <TouchableOpacity key={ch.id}
                                            style={[styles.chRow, active && styles.chRowActive, active && { borderLeftColor: hotel.color }]}
                                            onPress={() => { setActiveChannel(ch); setSavedChatIndex(null); if (IS_MOBILE) onToggleSidebar?.(); }}>
                                            <Icon name="hash" size={15} color={active ? hotel.color : '#554E40'} />
                                            <Text style={[styles.chName, active && { color: hotel.color }]}>{ch.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}

                        {/* Voice rooms */}
                        <TouchableOpacity style={styles.hotelRow} onPress={() => setExpanded(p => ({ ...p, voice: !p.voice }))}>
                            <Icon name="volume-2" size={13} color="#6B7FC4" />
                            <Text style={[styles.hotelLbl, { color: '#6B7FC4', marginLeft: 4 }]}>STANZE VOCALI</Text>
                            <Icon name={expanded.voice ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                        </TouchableOpacity>
                        {expanded.voice && (
                            availableRooms.length === 0
                                ? <Text style={styles.emptySubtext}>Nessuna stanza attiva</Text>
                                : availableRooms.map(r => (
                                    <TouchableOpacity key={r.id} style={styles.chRow} onPress={() => onJoinRoom?.(r.id)}>
                                        <Icon name="volume-2" size={13} color="#6B7FC4" />
                                        <Text style={[styles.chName, { color: '#6B7FC4' }]}>{r.name || r.id}</Text>
                                        {r.isTemp && <View style={styles.tempBadge}><Text style={styles.tempBadgeText}>TEMP</Text></View>}
                                    </TouchableOpacity>
                                ))
                        )}

                        {/* Saved call chats */}
                        <TouchableOpacity style={styles.hotelRow} onPress={() => setExpanded(p => ({ ...p, saved: !p.saved }))}>
                            <Icon name="archive" size={13} color="#8E7F6C" />
                            <Text style={[styles.hotelLbl, { color: '#8E7F6C', marginLeft: 4 }]}>CHAT SALVATE</Text>
                            <Icon name={expanded.saved ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                        </TouchableOpacity>
                        {expanded.saved && (
                            savedChats.length === 0
                                ? <Text style={styles.emptySubtext}>Nessuna chat salvata</Text>
                                : savedChats.map((sc, i) => (
                                    <TouchableOpacity key={i} style={[styles.chRow, savedChatIndex === i && styles.chRowActive]}
                                        onPress={() => { setSavedChatIndex(i); if (IS_MOBILE) onToggleSidebar?.(); }}>
                                        <Icon name="message-square" size={13} color="#8E7F6C" />
                                        <Text style={[styles.chName, { color: '#8E7F6C' }]} numberOfLines={1}>
                                            {new Date(sc.date).toLocaleDateString('it-IT')} · {sc.messages?.length || 0} msg
                                        </Text>
                                    </TouchableOpacity>
                                ))
                        )}
                    </ScrollView>

                    {/* Footer — avatar opens ProfileCard, gear opens Settings */}
                    <View style={styles.sidebarFooter}>
                        <TouchableOpacity style={styles.footerAvatarBtn} onPress={() => setProfileVisible(true)}>
                            <View style={styles.footerAvatar}>
                                <Text style={styles.footerAvatarTxt}>{user?.username?.charAt(0)?.toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.footerName}>{user?.username}</Text>
                                <Text style={styles.footerStation}>{user?.station}</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerGear} onPress={() => setSettingsVisible(true)}>
                            <Icon name="settings" size={18} color="#554E40" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── CHAT AREA ─────────────────────────────────────────────── */}
            <View style={[styles.chatArea, NO_SELECT]}>
                {/* Header */}
                <View style={styles.chatHeader}>
                    {IS_MOBILE && (
                        <TouchableOpacity onPress={onToggleSidebar} style={{ marginRight: 10 }}>
                            <Icon name="menu" size={20} color="#C8C4B8" />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.headerDot, { backgroundColor: isViewingSaved ? '#8E7F6C' : (activeHotel?.color || '#C9A84C') }]} />
                    {!isViewingSaved && <Icon name="hash" size={18} color="#C8C4B8" />}
                    {isViewingSaved && <Icon name="archive" size={18} color="#8E7F6C" />}
                    <Text style={styles.headerChName}>{channelLabel}</Text>
                    <Text style={styles.headerHotel}>• {hotelLabel}</Text>
                    <View style={{ flex: 1 }} />
                    {currentPinned.length > 0 && !isViewingSaved && (
                        <TouchableOpacity onPress={() => setPinnedVisible(true)} style={styles.headerAction}>
                            <Icon name="bookmark" size={17} color="#C9A84C" />
                            <Text style={styles.headerActionTxt}>{currentPinned.length}</Text>
                        </TouchableOpacity>
                    )}
                    {!isViewingSaved && <Text style={[styles.expiryNote, NO_SELECT]}>Msg · 48h</Text>}
                    {isViewingSaved && (
                        <TouchableOpacity onPress={() => setSavedChatIndex(null)} style={{ padding: 6 }}>
                            <Icon name="x" size={16} color="#8E7F6C" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Messages */}
                <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesPad} showsVerticalScrollIndicator={false}>
                    {currentMsgs.length === 0 && (
                        <View style={styles.emptyState}>
                            <Text style={[styles.emptyTitle, NO_SELECT]}>{channelLabel}</Text>
                            <Text style={[styles.emptyDesc, NO_SELECT]}>
                                {isViewingSaved ? 'Nessun messaggio salvato.' : 'Nessun messaggio. Inizia la conversazione.'}
                            </Text>
                        </View>
                    )}
                    {currentMsgs.map(msg => (
                        <MessageBubble key={msg.id} msg={msg} user={user} onPin={isViewingSaved ? () => { } : pin} onReact={isViewingSaved ? () => { } : react} onImageOpen={openImage} />
                    ))}
                </ScrollView>

                {/* Input bar — hidden for saved chats */}
                {!isViewingSaved && (
                    <View style={styles.inputBar}>
                        {/* Plus */}
                        <View style={{ position: 'relative' }}>
                            <TouchableOpacity style={styles.plusBtn} onPress={() => setPlusVisible(v => !v)}>
                                <Icon name="plus" size={19} color="#C8C4B8" />
                            </TouchableOpacity>
                            {plusVisible && (
                                <View style={styles.plusMenu}>
                                    <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusVisible(false); pickFile(); }}>
                                        <Icon name="image" size={16} color="#C9A84C" />
                                        <Text style={[styles.plusItemTxt, NO_SELECT]}>Invia file / immagine</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusVisible(false); setPollVisible(true); }}>
                                        <Icon name="check" size={16} color="#4CAF7D" />
                                        <Text style={[styles.plusItemTxt, NO_SELECT]}>Crea sondaggio</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Text input */}
                        <View style={styles.inputWrap}>
                            <TextInput
                                ref={inputRef}
                                style={[styles.input, ...(Platform.OS === 'web' ? [{ outlineStyle: 'none' }] : [])]}
                                placeholder={`Scrivi in #${activeChannel?.name}...`}
                                placeholderTextColor="#554E40"
                                value={draft}
                                onChangeText={setDraft}
                                onKeyPress={handleKey}
                                returnKeyType="send"
                                blurOnSubmit={false}
                                multiline
                            />
                        </View>

                        <TouchableOpacity style={styles.inputAction} onPress={() => setEmojiVisible(v => !v)}>
                            <Icon name="smile" size={19} color={emojiVisible ? '#C9A84C' : '#C8C4B8'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.sendBtn, !!draft.trim() && styles.sendBtnActive]} onPress={() => send()}>
                            <Icon name="send" size={16} color={draft.trim() ? '#111' : '#554E40'} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Emoji picker */}
                {emojiVisible && !isViewingSaved && (
                    <View style={styles.emojiPanelWrap}>
                        <EmojiPicker onSelect={(e) => setDraft(d => d + e)} onClose={() => setEmojiVisible(false)} />
                    </View>
                )}
            </View>

            {/* ── Modals ────────────────────────────────────────────────── */}
            <PollModal visible={pollVisible} onClose={() => setPollVisible(false)} onSend={(poll) => send('', null, null, poll)} />
            <PinnedModal visible={pinnedVisible} onClose={() => setPinnedVisible(false)} msgs={currentPinned} />
            <UserProfileCard visible={profileVisible} onClose={() => setProfileVisible(false)} user={user} socket={socket} />
            <MediaSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} user={user} />
            <ImageLightbox visible={lightboxVisible} images={lightboxImages} initialIndex={lightboxIndex} onClose={() => setLightboxVisible(false)} />
        </View>
    );
}

// ─── Styles — gold/black hotel theme, bigger fonts ─────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: '#100E0C' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },

    // Sidebar
    sidebar: { width: IS_MOBILE ? '100%' : 240, backgroundColor: '#0C0B09', flexDirection: 'column', borderRightWidth: 1, borderRightColor: 'rgba(201,168,76,0.08)' },
    sidebarHeader: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
    brandName: { color: '#C9A84C', fontSize: 15, fontWeight: '800', letterSpacing: 3 },
    brandSub: { color: '#554E40', fontSize: 10, letterSpacing: 2, marginTop: 2 },

    channelTree: { flex: 1, paddingVertical: 10 },
    hotelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
    hotelDot: { width: 8, height: 8, borderRadius: 4 },
    hotelLbl: { flex: 1, color: '#6E6960', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
    chRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginVertical: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 5, borderLeftWidth: 2, borderLeftColor: 'transparent' },
    chRowActive: { backgroundColor: 'rgba(201,168,76,0.09)' },
    chName: { color: '#6E6960', fontSize: 15 },
    emptySubtext: { color: '#3A3630', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 22, paddingVertical: 5 },
    tempBadge: { backgroundColor: 'rgba(250,166,26,0.15)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    tempBadgeText: { color: '#FAA61A', fontSize: 9, fontWeight: '700' },

    sidebarFooter: { flexDirection: 'row', alignItems: 'center', gap: 0, padding: 12, backgroundColor: '#0B0A08', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' },
    footerAvatarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    footerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2217', borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', justifyContent: 'center', alignItems: 'center' },
    footerAvatarTxt: { color: '#C9A84C', fontWeight: '800', fontSize: 16 },
    footerName: { color: '#C8C4B8', fontSize: 14, fontWeight: '600' },
    footerStation: { color: '#554E40', fontSize: 11 },
    footerGear: { padding: 7, borderRadius: 6 },

    // Chat
    chatArea: { flex: 1, backgroundColor: '#141210', flexDirection: 'column' },
    chatHeader: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    headerDot: { width: 9, height: 9, borderRadius: 4.5 },
    headerChName: { color: '#C8C4B8', fontWeight: '700', fontSize: 17 },
    headerHotel: { color: '#554E40', fontSize: 13 },
    headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerActionTxt: { color: '#C9A84C', fontSize: 12, fontWeight: '700' },
    expiryNote: { color: '#3A3630', fontSize: 11, marginLeft: 6 },

    messages: { flex: 1 },
    messagesPad: { paddingVertical: 16, paddingHorizontal: 16 },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
    emptyTitle: { color: '#C8C4B8', fontSize: 20, fontWeight: '700' },
    emptyDesc: { color: '#554E40', fontSize: 14 },
    emptyText: { color: '#554E40', textAlign: 'center', marginTop: 30, fontStyle: 'italic', fontSize: 14 },

    // Bubbles
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
    bubbleRowMine: { flexDirection: 'row-reverse' },
    bubbleAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2A2217', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    bubbleAvatarTxt: { color: '#C9A84C', fontWeight: '700', fontSize: 14 },
    bubbleCol: { maxWidth: '72%', gap: 3 },
    bubbleColMine: { alignItems: 'flex-end' },
    bubbleSender: { color: '#C9A84C', fontSize: 12, fontWeight: '700', marginLeft: 4 },
    bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 8, maxWidth: '100%' },
    bubbleOther: { backgroundColor: 'rgba(255,255,255,0.06)', borderTopLeftRadius: 4 },
    bubbleMine: { backgroundColor: 'rgba(201,168,76,0.16)', borderTopRightRadius: 4, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
    bubbleText: { color: '#BEB8AC', fontSize: 15, lineHeight: 22 },
    bubbleTextMine: { color: '#DDD5B8' },
    bubbleImg: { width: 240, height: 160, borderRadius: 10, marginTop: 4 },
    bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
    bubbleTime: { color: '#4A4440', fontSize: 11 },
    reactRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4 },
    reactBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(201,168,76,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)' },
    reactCount: { color: '#C9A84C', fontSize: 12, fontWeight: '600' },
    expiring: { color: '#A06A20', fontSize: 11, marginTop: 2 },

    // Poll
    pollCard: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginTop: 6, gap: 6 },
    pollQuestion: { color: '#C8C4B8', fontWeight: '700', fontSize: 14 },
    pollOption: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 8 },
    pollOptionText: { color: '#A8A090', fontSize: 14 },

    // Input
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)', gap: 8 },
    plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    plusMenu: { position: 'absolute', bottom: '110%', left: 0, backgroundColor: '#1A1812', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.14)', minWidth: 230, zIndex: 999 },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    plusItemTxt: { color: '#C8C4B8', fontSize: 15 },
    inputWrap: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(201,168,76,0.09)' },
    input: { color: '#C8C4B8', fontSize: 16, maxHeight: 120, paddingVertical: 8 },
    inputAction: { padding: 7, marginBottom: 2 },
    sendBtn: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    sendBtnActive: { backgroundColor: '#C9A84C' },

    // Emoji
    emojiPanelWrap: { borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' },
    emojiPicker: { backgroundColor: '#0E0D0C', height: 300 },
    emojiSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, backgroundColor: '#1C1A12', borderRadius: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    emojiSearchIn: { flex: 1, color: '#C8C4B8', paddingVertical: 8, fontSize: 14 },
    emojiSectionLabel: { color: '#554E40', fontSize: 10, letterSpacing: 2, paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
    emojiCell: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
    emojiChar: { fontSize: 22 },
    emojiDivider: { height: 1, backgroundColor: 'rgba(201,168,76,0.06)', marginHorizontal: 12, marginVertical: 6 },
    emojiCatScroll: { paddingHorizontal: 8, maxHeight: 32 },
    emojiCatBtn: { paddingHorizontal: 11, paddingVertical: 5, marginRight: 2 },
    emojiCatBtnActive: { borderBottomWidth: 2, borderBottomColor: '#C9A84C' },
    emojiCatLabel: { color: '#554E40', fontSize: 11, fontWeight: '700' },
    emojiScrollArea: { flex: 1 },

    // Context
    ctxMenu: { backgroundColor: '#1A1812', borderRadius: 9, padding: 4, minWidth: 200, borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)' },
    ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 5 },
    ctxTxt: { color: '#C8C4B8', fontSize: 14 },

    // Pinned
    pinnedModal: { width: '90%', maxWidth: 420, height: '60%', backgroundColor: '#1A1812', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)' },
    pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.08)' },
    pinnedTitle: { color: '#C8C4B8', fontSize: 16, fontWeight: '700', flex: 1 },
    pinnedItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    pinnedSender: { color: '#C9A84C', fontWeight: '700', fontSize: 13, marginBottom: 4 },
    pinnedText: { color: '#A8A090', fontSize: 14 },

    // Poll modal
    pollModal: { width: '90%', maxWidth: 380, backgroundColor: '#1A1812', borderRadius: 12, padding: 22, gap: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)' },
    pollTitle: { color: '#C8C4B8', fontWeight: '700', fontSize: 18, marginBottom: 4 },
    pollLabel: { color: '#554E40', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
    pollInput: { backgroundColor: '#0E0D0C', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 11, color: '#C8C4B8', fontSize: 15, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    pollAddOpt: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pollAddOptText: { color: '#C9A84C', fontSize: 14 },
    pollActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
    pollCancel: { paddingHorizontal: 14, paddingVertical: 10 },
    pollSend: { backgroundColor: '#C9A84C', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 7 },
});
