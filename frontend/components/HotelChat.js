/**
 * HotelChat.js — v2.5.0
 * Major overhaul:
 * - 3-column layout (Sidebar | Chat | Occupancy)
 * - [+ Crea Stanza] lobby button in sidebar
 * - Right panel showing online users (color-coded) & Hotel Info
 * - WhatsApp-style polls with voting (single/multiple choice)
 * - Auto-height input + Voice recording integration
 * - Server status badge in header
 * - Non-selectable UI, gold/black theme everywhere.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, Image, Dimensions, Platform, Modal, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import MediaSettings from './MediaSettings';
import UserProfileCard, { statusColor } from './UserProfileCard';
import ImageLightbox from './ImageLightbox';
import { VoiceRecorderButton, VoiceMessageBubble } from './VoiceMessage';
import { EMOJI_CATEGORIES, ALL_EMOJI } from '../utils/emoji_data';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

const NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none' } : {};
const YES_SELECT = Platform.OS === 'web' ? { userSelect: 'text' } : {};

// ─── Constants ─────────────────────────────────────────────────────────────
const HOTELS = [
    { id: 'duchessa', name: 'Duchessa Isabella', color: '#C9A84C', desc: 'Hotel 5 stelle Lusso a Ferrara in un palazzo del 500.', contact: '+39 0532 202197' },
    { id: 'blumen', name: 'Hotel Blumen', color: '#4CAF7D', desc: 'Hotel 3 stelle superior sul lungomare di Viserba.', contact: '+39 0541 734300' },
    { id: 'santorsola', name: "Sant'Orsola", color: '#6B7FC4', desc: 'Soggiorni confortevoli nel cuore di Bologna.', contact: '+39 051 341111' },
];
const ALL_CHANNELS = HOTELS.flatMap(h => h.channels = [
    { id: `${h.id}-generale`, name: 'generale' },
    { id: `${h.id}-media`, name: 'media' },
    { id: `${h.id}-annunci`, name: 'annunci' }
]);

const getRecentEmoji = () => { try { return JSON.parse(localStorage.getItem('gsa_recent_emoji') || '[]'); } catch { return []; } };
const saveRecentEmoji = (l) => { try { localStorage.setItem('gsa_recent_emoji', JSON.stringify(l)); } catch { } };

// ─── Server Status Badge ──────────────────────────────────────────────────
const StatusBadge = ({ ping, status }) => {
    const [open, setOpen] = useState(false);
    const color = status === 'Eccellente' ? '#23A559' : status === 'Buono' ? '#C9A84C' : '#ED4245';
    return (
        <View style={{ position: 'relative' }}>
            <TouchableOpacity style={styles.statusBadge} onPress={() => setOpen(!open)}>
                <View style={[styles.statusBadgeDot, { backgroundColor: color }]} />
                <Text style={styles.statusBadgeTxt}>{ping ? `${ping}ms` : '...'}</Text>
            </TouchableOpacity>
            {open && (
                <View style={styles.statusDetail}>
                    <Text style={styles.statusDetailTitle}>STATO RETE</Text>
                    <View style={styles.statusDetailRow}>
                        <Text style={styles.statusDetailLbl}>Latenza:</Text>
                        <Text style={[styles.statusDetailVal, { color }]}>{ping} ms</Text>
                    </View>
                    <View style={styles.statusDetailRow}>
                        <Text style={styles.statusDetailLbl}>Qualità:</Text>
                        <Text style={[styles.statusDetailVal, { color }]}>{status}</Text>
                    </View>
                </View>
            )}
        </View>
    );
};

// ─── Poll Redesign (WhatsApp-style) ──────────────────────────────────────
const PollMessage = ({ msg, onVote, user }) => {
    const poll = msg.poll;
    if (!poll) return null;
    const votes = poll.votes || {};
    const totalVotes = Object.values(votes).reduce((acc, v) => acc + v.length, 0);
    const myName = user?.username;

    return (
        <View style={styles.waPoll}>
            <Text style={styles.waPollTitle}>{poll.question}</Text>
            <Text style={styles.waPollSub}>{poll.isMultiple ? 'Scelta multipla' : 'Scelta singola'}</Text>

            {poll.options.map((opt, i) => {
                const optVotes = votes[i] || [];
                const percent = totalVotes > 0 ? (optVotes.length / totalVotes) * 100 : 0;
                const voted = optVotes.includes(myName);

                return (
                    <TouchableOpacity key={i} style={styles.waPollOpt} onPress={() => onVote(msg.id, i)}>
                        <View style={[styles.waPollBar, { width: `${percent}%` }]} />
                        <View style={styles.waPollContent}>
                            <View style={[styles.waPollCheck, voted && { borderColor: '#C9A84C' }]}>
                                {voted && <View style={styles.waPollCheckInner} />}
                            </View>
                            <Text style={[styles.waPollText, voted && { color: '#C9A84C' }]}>{opt}</Text>
                            <Text style={styles.waPollCount}>{optVotes.length}</Text>
                        </View>
                    </TouchableOpacity>
                );
            })}
            <Text style={styles.waPollFooter}>{totalVotes} voti • {poll.isMultiple ? 'Vota più opzioni' : 'Voto singolo'}</Text>
        </View>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar, availableRooms = [], onJoinRoom, onLogout, inCall }) {
    const [activeChannel, setActiveChannel] = useState(ALL_CHANNELS[0]);
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [expanded, setExpanded] = useState({ duchessa: true, blumen: false, santorsola: false, voice: true, saved: false, users: true });
    const [draft, setDraft] = useState('');
    const [savedChats, setSavedChats] = useState([]);

    // UI States
    const [profileVisible, setProfileVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [emojiVisible, setEmojiVisible] = useState(false);
    const [plusVisible, setPlusVisible] = useState(false);
    const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''], isMultiple: false });

    const [pinnedVisible, setPinnedVisible] = useState(false);
    const [ping, setPing] = useState(null);
    const [pingStatus, setPingStatus] = useState('...');

    // Lightbox
    const [lbVisible, setLbVisible] = useState(false);
    const [lbImages, setLbImages] = useState([]);
    const [lbIdx, setLbIdx] = useState(0);

    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    // ── Sync Profile ───────────────────────────────────────────────────
    const loadProfile = () => {
        try {
            const p = JSON.parse(localStorage.getItem('gsa_user_profile') || '{}');
            if (p.username) user.username = p.username;
            if (p.bio) user.bio = p.bio;
            if (p.profilePic) user.profilePic = p.profilePic;
        } catch { }
    };

    // ── Socket & Effects ──────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        loadProfile();

        ALL_CHANNELS.forEach(ch => {
            socket.emit('join-channel', { channelId: ch.id });
            socket.emit('get-channel-history', { channelId: ch.id });
        });

        socket.on('channel-history', ({ channelId, messages: msgs, pinned: pins }) => {
            setMessages(p => ({ ...p, [channelId]: msgs }));
            setPinned(p => ({ ...p, [channelId]: pins || [] }));
        });

        socket.on('channel-message', ({ channelId, message }) => {
            setMessages(p => ({ ...p, [channelId]: [...(p[channelId] || []), message] }));
        });

        socket.on('online-users', setOnlineUsers);

        socket.on('channel-poll-update', ({ channelId, messageId, votes }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m =>
                    m.id === messageId ? { ...m, poll: { ...m.poll, votes } } : m
                )
            }));
        });

        const i = setInterval(() => {
            const t = Date.now();
            fetch(`${process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://localhost:3000'}/ping`, { cache: 'no-store' })
                .then(() => {
                    const ms = Date.now() - t;
                    setPing(ms);
                    setPingStatus(ms < 100 ? 'Eccellente' : ms < 250 ? 'Buono' : 'Lento');
                }).catch(() => setPingStatus('Off'));
        }, 5000);

        return () => {
            socket.off('channel-history');
            socket.off('channel-message');
            socket.off('online-users');
            socket.off('channel-poll-update');
            clearInterval(i);
        };
    }, [socket]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages[activeChannel?.id], activeChannel]);

    // ── Actions ────────────────────────────────────────────────────────
    const send = (text = '', imageData = null, gifUrl = null, poll = null, voiceData = null, voiceDuration = 0) => {
        if (!socket || !activeChannel) return;
        socket.emit('channel-message', {
            channelId: activeChannel.id,
            text, imageData, gifUrl, poll, voiceData, voiceDuration
        });
        setDraft('');
    };

    const vote = (messageId, optionIndex) => {
        if (!socket) return;
        socket.emit('channel-poll-vote', { channelId: activeChannel.id, messageId, optionIndex });
    };

    const activeHotel = HOTELS.find(h => h.id === activeChannel?.id.split('-')[0]);

    // ── Rendering ──────────────────────────────────────────────────────
    return (
        <View style={styles.root}>

            {/* ── LEFT SIDEBAR ────────────────────────────────────────── */}
            {(!IS_MOBILE || sidebarVisible) && (
                <View style={[styles.column, styles.sidebar]}>
                    <LinearGradient colors={['#1C1A12', '#141210']} style={styles.sidebarHeader}>
                        <Text style={styles.brandName}>GSA COMMUNICATIONS</Text>
                        <Text style={styles.brandSub}>SISTEMA ALBERGHIERO</Text>
                    </LinearGradient>

                    <ScrollView style={{ flex: 1 }}>
                        {HOTELS.map(hotel => (
                            <View key={hotel.id}>
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => setExpanded(p => ({ ...p, [hotel.id]: !p[hotel.id] }))}>
                                    <View style={[styles.hotelDot, { backgroundColor: hotel.color }]} />
                                    <Text style={styles.hotelLbl}>{hotel.name.toUpperCase()}</Text>
                                    <Icon name={expanded[hotel.id] ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded[hotel.id] && ALL_CHANNELS.filter(c => c.id.startsWith(hotel.id)).map(ch => (
                                    <TouchableOpacity key={ch.id}
                                        style={[styles.chRow, activeChannel.id === ch.id && styles.chRowActive]}
                                        onPress={() => { setActiveChannel(ch); if (IS_MOBILE) onToggleSidebar(); }}>
                                        <Icon name="hash" size={15} color={activeChannel.id === ch.id ? hotel.color : '#554E40'} />
                                        <Text style={[styles.chName, activeChannel.id === ch.id && { color: hotel.color }]}>{ch.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))}
                    </ScrollView>

                    {/* Bottom controls / Crea Stanza */}
                    <View style={styles.sidebarFooter}>
                        {!inCall && (
                            <TouchableOpacity style={styles.createBtn} onPress={() => socket.emit('create-room')}>
                                <Icon name="plus-circle" size={18} color="#111" />
                                <Text style={styles.createBtnTxt}>CREA STANZA VOCALE</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.userFooter}>
                            <TouchableOpacity style={styles.avatarBtn} onPress={() => setProfileVisible(true)}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarTxt}>{(user.username || '?').charAt(0).toUpperCase()}</Text>
                                    <View style={[styles.statusDot, { backgroundColor: statusColor(JSON.parse(localStorage.getItem('gsa_user_status') || '"online"')) }]} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.userName}>{user.username}</Text>
                                    <Text style={styles.userStat}>{user.station}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)}>
                                <Icon name="settings" size={18} color="#554E40" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* ── CENTER CHAT ─────────────────────────────────────────── */}
            <View style={[styles.column, styles.chatCol]}>
                <View style={styles.chatHeader}>
                    {IS_MOBILE && <TouchableOpacity onPress={onToggleSidebar} style={{ marginRight: 12 }}><Icon name="menu" size={20} color="#C8C4B8" /></TouchableOpacity>}
                    <Icon name="hash" size={20} color="#554E40" />
                    <Text style={styles.headerChName}>{activeChannel.name}</Text>
                    <View style={{ flex: 1 }} />
                    <StatusBadge ping={ping} status={pingStatus} />
                </View>

                <ScrollView ref={scrollRef} style={styles.messagesScroll} contentContainerStyle={{ padding: 16 }}>
                    {(messages[activeChannel.id] || []).map(m => (
                        <View key={m.id} style={[styles.msgRow, m.sender === user.username && styles.msgRowMine]}>
                            <View style={[styles.bubble, m.sender === user.username ? styles.bubbleMine : styles.bubbleOther]}>
                                {m.sender !== user.username && <Text style={styles.msgSender}>{m.sender}</Text>}
                                {m.text ? <Text style={styles.msgText}>{m.text}</Text> : null}
                                {m.voiceData && <VoiceMessageBubble src={m.voiceData} duration={m.voiceDuration} isMine={m.sender === user.username} />}
                                {m.poll && <PollMessage msg={m} user={user} onVote={vote} />}
                                {m.imageData && <Image source={{ uri: m.imageData }} style={styles.msgImg} />}
                                <View style={styles.msgMeta}>
                                    <Text style={styles.msgTime}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    {m.sender === user.username && <Icon name="check" size={12} color="rgba(201,168,76,0.5)" />}
                                </View>
                            </View>
                        </View>
                    ))}
                </ScrollView>

                <View style={styles.inputArea}>
                    <View style={styles.inputPlusWrap}>
                        <TouchableOpacity style={styles.plusBtn} onPress={() => setPlusVisible(!plusVisible)}>
                            <Icon name="plus" size={20} color="#C8C4B8" />
                        </TouchableOpacity>
                        {plusVisible && (
                            <View style={styles.plusMenu}>
                                <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusVisible(false); setPollVisible(true); }}>
                                    <Icon name="check" size={16} color="#C9A84C" /><Text style={styles.plusItemTxt}>Sondaggio</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.plusItem} onPress={() => setPlusVisible(false)}>
                                    <Icon name="image" size={16} color="#C9A84C" /><Text style={styles.plusItemTxt}>Immagine</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder={`Scrivi in #${activeChannel.name}...`}
                        placeholderTextColor="#554E40"
                        multiline
                        value={draft}
                        onChangeText={setDraft}
                        numberOfLines={1}
                        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                    <VoiceRecorderButton onSend={(data, dur) => send('', null, null, null, data, dur)} />
                    <TouchableOpacity style={[styles.sendBtn, !!draft.trim() && styles.sendBtnActive]} onPress={() => draft.trim() && send(draft)}>
                        <Icon name="send" size={16} color={draft.trim() ? '#111' : '#554E40'} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
            {!IS_MOBILE && (
                <View style={[styles.column, styles.rightPanel]}>
                    <Text style={styles.rightTitle}>OCCUPANTI ONLINE — {onlineUsers.length}</Text>
                    <ScrollView style={{ flex: 1 }}>
                        <TouchableOpacity style={styles.occupancyHeader} onPress={() => setExpanded(p => ({ ...p, users: !p.users }))}>
                            <Text style={styles.occupancyTitle}>DIPENDENTI</Text>
                            <Icon name={expanded.users ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                        </TouchableOpacity>
                        {expanded.users && onlineUsers.map((u, i) => (
                            <View key={i} style={styles.userRow}>
                                <View style={[styles.userDot, { backgroundColor: statusColor(u.status) }]} />
                                <Text style={[styles.userRowName, { color: HOTELS.find(h => u.username.includes(h.name) || u.station.includes(h.id))?.color || '#C8C4B8' }]}>
                                    {u.username}
                                </Text>
                                {u.roomId && <Icon name="volume-2" size={12} color="#6B7FC4" />}
                            </View>
                        ))}

                        <View style={styles.divider} />

                        {activeHotel && (
                            <View style={styles.hotelInfo}>
                                <Text style={styles.occupancyTitle}>INFORMAZIONI HOTEL</Text>
                                <View style={styles.hotelBranding}>
                                    <View style={[styles.hotelBrandDot, { backgroundColor: activeHotel.color }]} />
                                    <Text style={[styles.hotelBrandName, { color: activeHotel.color }]}>{activeHotel.name}</Text>
                                </View>
                                <Text style={styles.hotelDesc}>{activeHotel.desc}</Text>
                                <Text style={styles.hotelContact}>📞 {activeHotel.contact}</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}

            {/* MODALS */}
            <UserProfileCard visible={profileVisible} onClose={() => setProfileVisible(false)} user={user} socket={socket} onLogout={onLogout} />
            <MediaSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} user={user} />

            {/* Poll Creator */}
            <Modal visible={pollVisible} transparent animationType="slide">
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPollVisible(false)}>
                    <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>CREA SONDAGGIO</Text>
                        <TextInput
                            style={styles.modalInput} placeholder="Domanda..."
                            placeholderTextColor="#554E40"
                            onChangeText={t => setPollDraft(p => ({ ...p, question: t }))}
                        />
                        {pollDraft.options.map((opt, i) => (
                            <TextInput key={i} style={styles.modalInputSmall} placeholder={`Opzione ${i + 1}`} placeholderTextColor="#3A3630"
                                onChangeText={t => {
                                    const next = [...pollDraft.options];
                                    next[i] = t;
                                    setPollDraft(p => ({ ...p, options: next }));
                                }}
                            />
                        ))}
                        <TouchableOpacity style={styles.addOptBtn} onPress={() => setPollDraft(p => ({ ...p, options: [...p.options, ''] }))}>
                            <Icon name="plus" size={14} color="#C9A84C" /><Text style={styles.addOptTxt}>Aggiungi Opzione</Text>
                        </TouchableOpacity>
                        <View style={styles.modalCheckRow}>
                            <TouchableOpacity style={styles.checkWrap} onPress={() => setPollDraft(p => ({ ...p, isMultiple: !p.isMultiple }))}>
                                <View style={[styles.checkBox, pollDraft.isMultiple && { borderColor: '#C9A84C' }]}>
                                    {pollDraft.isMultiple && <View style={styles.checkInner} />}
                                </View>
                                <Text style={styles.checkTxt}>Risposta Multipla</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.modalSendBtn} onPress={() => {
                            if (pollDraft.question && pollDraft.options.filter(o => o.trim()).length >= 2) {
                                send('', null, null, { ...pollDraft, options: pollDraft.options.filter(o => o.trim()) });
                                setPollVisible(false);
                            }
                        }}><Text style={styles.modalSendTxt}>INVIA SONDAGGIO</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: '#0C0B09', ...NO_SELECT },
    column: { height: '100%', borderRightWidth: 1, borderRightColor: 'rgba(201,168,76,0.06)' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { width: 400, backgroundColor: '#16140F', borderRadius: 16, padding: 24, gap: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
    modalTitle: { color: '#C9A84C', fontSize: 18, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
    modalInput: { backgroundColor: '#0E0D0C', borderRadius: 8, padding: 12, color: '#C8C4B8', fontSize: 16 },
    modalInputSmall: { backgroundColor: '#0E0D0C', borderRadius: 8, padding: 10, color: '#A8A090', fontSize: 14 },
    addOptBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
    addOptTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '600' },
    modalCheckRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    checkWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#554E40', justifyContent: 'center', alignItems: 'center' },
    checkInner: { width: 10, height: 10, borderRadius: 2, backgroundColor: '#C9A84C' },
    checkTxt: { color: '#C8C4B8', fontSize: 14, fontWeight: '600' },
    modalSendBtn: { backgroundColor: '#C9A84C', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
    modalSendTxt: { color: '#111', fontSize: 14, fontWeight: '800' },

    // Sidebar
    sidebar: { width: 240, backgroundColor: '#0C0B09' },
    sidebarHeader: { padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
    brandName: { color: '#C9A84C', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
    brandSub: { color: '#554E40', fontSize: 9, letterSpacing: 1, marginTop: 4 },

    navHotelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingTop: 20 },
    hotelDot: { width: 8, height: 8, borderRadius: 4 },
    hotelLbl: { flex: 1, color: '#6E6960', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
    chRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
    chRowActive: { backgroundColor: 'rgba(201,168,76,0.08)' },
    chName: { color: '#6E6960', fontSize: 15, fontWeight: '600' },

    sidebarFooter: { marginTop: 'auto', padding: 12, backgroundColor: '#0B0A08', gap: 12 },
    createBtn: { backgroundColor: '#C9A84C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, borderRadius: 8 },
    createBtnTxt: { color: '#111', fontSize: 11, fontWeight: '900' },
    userFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    avatarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2A2217', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    avatarTxt: { color: '#C9A84C', fontSize: 16, fontWeight: '800' },
    statusDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0B0A08' },
    userName: { color: '#C8C4B8', fontSize: 14, fontWeight: '700' },
    userStat: { color: '#554E40', fontSize: 11 },
    gearBtn: { padding: 8 },

    // Chat
    chatCol: { flex: 1, backgroundColor: '#141210' },
    chatHeader: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    headerChName: { color: '#C8C4B8', fontWeight: '800', fontSize: 18 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    statusBadgeDot: { width: 8, height: 8, borderRadius: 4 },
    statusBadgeTxt: { color: '#C8C4B8', fontSize: 12, fontWeight: '600' },
    statusDetail: { position: 'absolute', top: 40, right: 0, width: 180, backgroundColor: '#1A1812', borderRadius: 10, padding: 14, borderSize: 1, borderColor: 'rgba(201,168,76,0.2)', zIndex: 100 },
    statusDetailTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', marginBottom: 10 },
    statusDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    statusDetailLbl: { color: '#6E6960', fontSize: 12 },
    statusDetailVal: { fontWeight: '700', fontSize: 12 },

    messagesScroll: { flex: 1 },
    msgRow: { flexDirection: 'row', marginBottom: 12 },
    msgRowMine: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
    bubbleOther: { backgroundColor: 'rgba(255,255,255,0.05)', borderTopLeftRadius: 4 },
    bubbleMine: { backgroundColor: 'rgba(201,168,76,0.12)', borderTopRightRadius: 4, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    msgSender: { color: '#C9A84C', fontSize: 12, fontWeight: '800', marginBottom: 4 },
    msgText: { color: '#A8A090', fontSize: 16, lineHeight: 22, ...YES_SELECT },
    msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
    msgTime: { color: '#3A3630', fontSize: 11, fontWeight: '600' },
    msgImg: { width: 280, height: 180, borderRadius: 12, marginTop: 8 },

    inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' },
    input: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, color: '#C8C4B8', fontSize: 16, maxHeight: SCREEN_H * 0.15 },
    plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    plusMenu: { position: 'absolute', bottom: 50, left: 0, width: 200, backgroundColor: '#1A1812', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', zIndex: 1000 },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8 },
    plusItemTxt: { color: '#C8C4B8', fontSize: 15, fontWeight: '600' },
    sendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    sendBtnActive: { backgroundColor: '#C9A84C' },

    // Right Panel
    rightPanel: { width: 240, backgroundColor: '#0C0B09', padding: 20 },
    rightTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 20 },
    occupancyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    occupancyTitle: { flex: 1, color: '#6E6960', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    userDot: { width: 8, height: 8, borderRadius: 4 },
    userRowName: { fontSize: 14, fontWeight: '700' },
    divider: { height: 1, backgroundColor: 'rgba(201,168,76,0.06)', marginVertical: 20 },

    hotelInfo: { gap: 12 },
    hotelBranding: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hotelBrandDot: { width: 12, height: 12, borderRadius: 3 },
    hotelBrandName: { fontSize: 16, fontWeight: '800' },
    hotelDesc: { color: '#554E40', fontSize: 14, lineHeight: 22 },
    hotelContact: { color: '#C8C4B8', fontSize: 14, fontWeight: '600' },

    // WA Poll Style
    waPoll: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14, gap: 8, marginTop: 6, minWidth: 260 },
    waPollTitle: { color: '#C8C4B8', fontSize: 17, fontWeight: '700' },
    waPollSub: { color: '#554E40', fontSize: 11, fontWeight: '600' },
    waPollOpt: { position: 'relative', height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
    waPollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(201,168,76,0.15)' },
    waPollContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
    waPollCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#554E40', justifyContent: 'center', alignItems: 'center' },
    waPollCheckInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A84C' },
    waPollText: { flex: 1, color: '#A8A090', fontSize: 15, fontWeight: '600' },
    waPollCount: { color: '#C9A84C', fontSize: 14, fontWeight: '700' },
    waPollFooter: { color: '#3A3630', fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
});
