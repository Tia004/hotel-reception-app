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
import html2pdf from 'html2pdf.js';
import DynamicBackground from './DynamicBackground';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;

const NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none' } : {};
const YES_SELECT = Platform.OS === 'web' ? { userSelect: 'text' } : {};

// ─── Constants ─────────────────────────────────────────────────────────────
const HOTELS = [
    { id: 'duchessa', name: 'Duchessa Isabella', color: '#C9A84C', desc: 'Hotel 5 stelle Lusso a Ferrara in un palazzo del 500.', contact: '+39 0532 202197' },
    { id: 'blumen', name: 'Hotel Blumen', color: '#4CAF7D', desc: 'Via Mazzini a Bologna', contact: '+39 0541 734300' },
    { id: 'santorsola', name: "Sant'Orsola", color: '#6B7FC4', desc: 'Soggiorni confortevoli nel cuore di Bologna.', contact: '+39 051 341111' },
];
const ALL_CHANNELS = HOTELS.flatMap(h => h.channels = [
    { id: `${h.id}-generale`, name: 'generale' },
    { id: `${h.id}-media`, name: 'media' },
    { id: `${h.id}-annunci`, name: 'annunci' }
]);

const getRecentEmoji = () => { try { return JSON.parse(localStorage.getItem('gsa_recent_emoji') || '[]'); } catch { return []; } };
const saveRecentEmoji = (l) => { try { localStorage.setItem('gsa_recent_emoji', JSON.stringify(l)); } catch { } };

// ─── Markdown Parser ───────────────────────────────────────────────────────
const parseMarkdown = (text) => {
    if (!text) return null;
    const parts = text.split(/(```[\s\S]*?```|\*\*.*?\*\*|\*.*?\*|^# .*$)/m);

    return parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('```') && part.endsWith('```')) {
            return <Text key={i} style={styles.mdCode}>{part.slice(3, -3)}</Text>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={i} style={styles.mdBold}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <Text key={i} style={styles.mdItalic}>{part.slice(1, -1)}</Text>;
        }
        if (part.startsWith('# ')) {
            return <Text key={i} style={styles.mdH1}>{part.slice(2)}</Text>;
        }
        return <Text key={i}>{part}</Text>;
    });
};

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
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar, availableRooms = [], onJoinRoom, onLogout, inCall, hideChatColumn }) {
    const [activeChannel, setActiveChannel] = useState(ALL_CHANNELS[0]);
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [activeRooms, setActiveRooms] = useState([]);
    const [expanded, setExpanded] = useState({ duchessa: true, blumen: false, santorsola: false, voice: true, saved: false, users: true, rooms: true });
    const [draft, setDraft] = useState('');
    const [savedChats, setSavedChats] = useState([]);
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMsg, setEditingMsg] = useState(null);

    // UI States
    const [profileVisible, setProfileVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [infoModal, setInfoModal] = useState(null);
    const [alertMsg, setAlertMsg] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [plusVisible, setPlusVisible] = useState(false);
    const [pollVisible, setPollVisible] = useState(false);
    const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''], isMultiple: false });

    const [pinnedVisible, setPinnedVisible] = useState(false);
    const [ping, setPing] = useState(null);
    const [pingStatus, setPingStatus] = useState('...');

    // Lightbox
    const [lbVisible, setLbVisible] = useState(false);
    const [lbImages, setLbImages] = useState([]);
    const [lbIdx, setLbIdx] = useState(0);

    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [hoveredMsg, setHoveredMsg] = useState(null);

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
        socket.on('rooms-update', setActiveRooms);

        socket.on('channel-poll-update', ({ channelId, messageId, votes }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m =>
                    m.id === messageId ? { ...m, poll: { ...m.poll, votes } } : m
                )
            }));
        });

        socket.on('message-edited', ({ channelId, messageId, text }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, text, edited: true } : m)
            }));
        });

        socket.on('message-deleted', ({ channelId, messageId }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).filter(m => m.id !== messageId)
            }));
        });

        socket.on('message-reacted', ({ channelId, messageId, reactions }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, reactions } : m)
            }));
        });

        const checkPing = () => {
            const t = Date.now();
            fetch(`${process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://localhost:3000'}/ping`, { cache: 'no-store' })
                .then(() => {
                    const ms = Date.now() - t;
                    setPing(ms);
                    setPingStatus(ms < 100 ? 'Eccellente' : ms < 250 ? 'Buono' : 'Lento');
                }).catch(() => setPingStatus('Off'));
        };

        checkPing(); // run immediately
        const i = setInterval(checkPing, 5000);

        return () => {
            socket.off('channel-history');
            socket.off('channel-message');
            socket.off('online-users');
            socket.off('channel-poll-update');
            socket.off('message-edited');
            socket.off('message-deleted');
            socket.off('message-reacted');
            clearInterval(i);
        };
    }, [socket]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages[activeChannel?.id], activeChannel]);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const onCtx = (e) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY }); };
        const onClk = () => setContextMenu(null);
        document.addEventListener('contextmenu', onCtx);
        document.addEventListener('click', onClk);
        return () => { document.removeEventListener('contextmenu', onCtx); document.removeEventListener('click', onClk); };
    }, []);

    const send = (text = '', imageData = null, gifUrl = null, poll = null, voiceData = null, voiceDuration = 0) => {
        if (!socket || !activeChannel) return;

        if (editingMsg) {
            socket.emit('edit-message', { channelId: activeChannel.id, messageId: editingMsg.id, text });
            setEditingMsg(null);
            setDraft('');
            return;
        }

        socket.emit('channel-message', {
            channelId: activeChannel.id,
            text, imageData, gifUrl, poll, voiceData, voiceDuration,
            replyTo: replyingTo ? replyingTo.id : null
        });
        setDraft('');
        setReplyingTo(null);
    };

    const reactMessage = (messageId, emoji) => {
        if (!socket) return;
        socket.emit('react-message', { channelId: activeChannel.id, messageId, emoji });
    };

    const vote = (messageId, optionIndex) => {
        if (!socket) return;
        socket.emit('channel-poll-vote', { channelId: activeChannel.id, messageId, optionIndex });
    };

    // ── Export Chat to PDF ────────────────────────────────────────────────
    const exportChatPDF = () => {
        if (Platform.OS !== 'web') {
            setAlertMsg('Il download del PDF è supportato solo su browser (Web).');
            return;
        }
        
        const msgs = messages[activeChannel.id] || [];
        if (msgs.length === 0) {
            setAlertMsg('La chat è vuota!');
            return;
        }

        let htmlContent = `
            <div style="padding: 20px; font-family: sans-serif; color: #111;">
                <h1 style="color: #dba311;">Storico Chat: #${activeChannel.name}</h1>
                <p style="color: #666; font-size: 14px;">Hotel Reception App - Generato il: ${new Date().toLocaleString()}</p>
                <hr style="border: 1px solid #ddd; margin-bottom: 20px;" />
        `;

        msgs.forEach(m => {
            const time = new Date(m.timestamp).toLocaleTimeString();
            const textContent = m.text ? m.text : (m.voiceData ? '[Messaggio Vocale]' : (m.imageData ? '[Immagine]' : ''));
            htmlContent += `
            <div style="margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                <strong style="color: #dba311;">${m.sender}</strong> 
                <span style="color: gray; font-size: 12px; margin-left: 8px;">(${time})</span>
                <p style="margin: 4px 0 0 0; font-size: 15px; color: #333; line-height: 1.5;">${textContent}</p>
            </div>`;
        });
        
        htmlContent += '</div>';

        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        document.body.appendChild(element);

        html2pdf().set({
            margin: 10,
            filename: `Chat_${activeChannel.name}_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(element).save().then(() => {
            document.body.removeChild(element);
        });
    };

    const activeHotel = HOTELS.find(h => h.id === activeChannel?.id.split('-')[0]);

    // ── Rendering ──────────────────────────────────────────────────────
    return (
        <View style={styles.root}>
            <DynamicBackground />
            
            {infoModal && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
                    <TouchableOpacity style={styles.modalOverlay} onPress={() => setInfoModal(null)}>
                        <TouchableOpacity activeOpacity={1} style={styles.infoModalBox}>
                            <Text style={styles.infoTitle}>Dettagli Messaggio</Text>
                            <Text style={styles.infoLabel}>Inviato da: <Text style={{ color: '#C8C4B8' }}>{infoModal.sender}</Text></Text>
                            <Text style={styles.infoLabel}>Ore: <Text style={{ color: '#C8C4B8' }}>{new Date(infoModal.timestamp).toLocaleString()}</Text></Text>
                            <Text style={styles.infoLabel}>Visto da: <Text style={{ color: '#C8C4B8' }}>Tutti ({onlineUsers.length})</Text></Text>

                            <TouchableOpacity style={[styles.createBtn, { marginTop: 20 }]} onPress={() => setInfoModal(null)}>
                                <Text style={styles.createBtnTxt}>Chiudi</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}

            {!!alertMsg && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setAlertMsg('')}>
                    <TouchableOpacity style={styles.modalOverlay} onPress={() => setAlertMsg('')}>
                        <TouchableOpacity activeOpacity={1} style={styles.infoModalBox}>
                            <Icon name="alert-triangle" size={32} color="#E57373" style={{ alignSelf: 'center', marginBottom: 12 }} />
                            <Text style={[styles.infoTitle, { textAlign: 'center', color: '#E57373' }]}>Attenzione</Text>
                            <Text style={styles.hotelDesc}>{alertMsg}</Text>
                            <TouchableOpacity style={[styles.createBtn, { marginTop: 20 }]} onPress={() => setAlertMsg('')}>
                                <Text style={styles.createBtnTxt}>OK</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}

            {!!deleteTarget && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
                    <TouchableOpacity style={styles.modalOverlay} onPress={() => setDeleteTarget(null)}>
                        <TouchableOpacity activeOpacity={1} style={styles.infoModalBox}>
                            <Icon name="trash" size={28} color="#E57373" style={{ alignSelf: 'center', marginBottom: 12 }} />
                            <Text style={[styles.infoTitle, { textAlign: 'center', color: '#E57373' }]}>Elimina Messaggio</Text>
                            <Text style={[styles.hotelDesc, { textAlign: 'center' }]}>Vuoi eliminare questo messaggio? L'azione è irreversibile.</Text>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                                <TouchableOpacity style={[styles.createBtn, { flex: 1, backgroundColor: '#2A2217' }]} onPress={() => setDeleteTarget(null)}>
                                    <Text style={[styles.createBtnTxt, { color: '#C8C4B8' }]}>Annulla</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.createBtn, { flex: 1, backgroundColor: '#ED4245' }]} onPress={() => {
                                    socket.emit('delete-message', { channelId: activeChannel.id, messageId: deleteTarget });
                                    setDeleteTarget(null);
                                }}>
                                    <Text style={styles.createBtnTxt}>Elimina</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}

            {leftCollapsed && !IS_MOBILE && (
                <TouchableOpacity style={styles.leftTrapezoid} onPress={() => setLeftCollapsed(false)}>
                    <Icon name="chevron-right" size={16} color="#C9A84C" />
                </TouchableOpacity>
            )}
            {rightCollapsed && !IS_MOBILE && (
                <TouchableOpacity style={styles.rightTrapezoid} onPress={() => setRightCollapsed(false)}>
                    <Icon name="chevron-left" size={16} color="#C9A84C" />
                </TouchableOpacity>
            )}

            {/* ── LEFT SIDEBAR ────────────────────────────────────────── */}
            {((!IS_MOBILE && !leftCollapsed) || (IS_MOBILE && sidebarVisible)) && (
                <View style={[styles.column, styles.sidebar]}>
                    <LinearGradient colors={['#1C1A12', '#141210']} style={styles.sidebarHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Image source={require('../assets/logo.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
                                <Text style={styles.brandName}>GSA HOTELS</Text>
                            </View>
                            {!IS_MOBILE && (
                                <TouchableOpacity onPress={() => setLeftCollapsed(true)}>
                                    <Icon name="chevron-left" size={18} color="#554E40" />
                                </TouchableOpacity>
                            )}
                        </View>
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

                        {/* Active Voice Rooms Section */}
                        {activeRooms.length > 0 && (
                            <View style={{ marginTop: 10 }}>
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => setExpanded(p => ({ ...p, rooms: !p.rooms }))}>
                                    <View style={[styles.hotelDot, { backgroundColor: '#6B7FC4' }]} />
                                    <Text style={styles.hotelLbl}>STANZE ATTIVE</Text>
                                    <Icon name={expanded.rooms ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded.rooms && activeRooms.map(room => (
                                    <TouchableOpacity key={room.id}
                                        style={styles.chRow}
                                        onPress={() => {
                                            if (inCall) setAlertMsg('Sei già in una stanza. Chiudila prima di entrarne in una nuova.');
                                            else socket.emit('join-room', { roomId: room.id });
                                        }}>
                                        <Icon name="volume-2" size={15} color="#6B7FC4" />
                                        <Text style={[styles.chName, { color: '#6B7FC4' }]}>{room.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    {/* Bottom controls / Crea Stanza */}
                    <View style={styles.sidebarFooter}>
                        {!inCall && (
                            <TouchableOpacity style={styles.createBtn} onPress={() => socket.emit('create-room', {})}>
                                <Icon name="plus" size={18} color="#111" />
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
            {!hideChatColumn && <View style={[styles.column, styles.chatCol]}>
                <View style={styles.chatHeader}>
                    {IS_MOBILE && <TouchableOpacity onPress={onToggleSidebar} style={{ marginRight: 12 }}><Icon name="menu" size={20} color="#C8C4B8" /></TouchableOpacity>}
                    <Icon name="hash" size={20} color="#554E40" />
                    <Text style={styles.headerChName}>{activeChannel.name}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={styles.pdfBtn} onPress={exportChatPDF}>
                        <Icon name="download" size={16} color="#C9A84C" />
                        <Text style={styles.pdfBtnTxt}>PDF</Text>
                    </TouchableOpacity>
                    <StatusBadge ping={ping} status={pingStatus} />
                </View>

                <LinearGradient colors={['rgba(12, 11, 9, 0.6)', 'rgba(20, 18, 14, 0.7)']} style={{ flex: 1 }}>
                    <ScrollView ref={scrollRef} style={styles.messagesScroll} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                        {(messages[activeChannel.id] || []).map(m => {
                            const isMine = m.sender === user.username;
                            const repliedMsg = m.replyTo ? (messages[activeChannel.id] || []).find(rm => rm.id === m.replyTo) : null;

                            return (
                                <View key={m.id} style={[styles.msgRow, isMine && styles.msgRowMine]}>
                                    <TouchableOpacity
                                        style={styles.bubbleWrap}
                                        activeOpacity={1}
                                        onLongPress={() => setHoveredMsg(hoveredMsg === m.id ? null : m.id)}
                                        {...(Platform.OS === 'web' ? {
                                            onMouseEnter: () => setHoveredMsg(m.id),
                                            onMouseLeave: () => setHoveredMsg(null)
                                        } : {})}
                                    >
                                        {/* Hover Action Menu */}
                                        {hoveredMsg === m.id && (
                                            <View style={styles.hoverMenu}>
                                                <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => reactMessage(m.id, '❤️')}><Text>❤️</Text></TouchableOpacity>
                                                <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => reactMessage(m.id, '👍')}><Text>👍</Text></TouchableOpacity>
                                                <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => setReplyingTo(m)}><Icon name="corner-up-left" size={14} color="#A8A090" /></TouchableOpacity>
                                                {(isMine && !m.poll) && (
                                                    <>
                                                        <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => { setEditingMsg(m); setDraft(m.text || ''); }}>
                                                            <Icon name="edit-2" size={14} color="#A8A090" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => {
                                                            setDeleteTarget(m.id);
                                                        }}>
                                                            <Icon name="trash-2" size={14} color="#E57373" />
                                                        </TouchableOpacity>
                                                    </>
                                                )}
                                                <TouchableOpacity style={styles.hoverMenuBtn} onPress={() => setInfoModal(m)}>
                                                    <Icon name="info" size={14} color="#A8A090" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {/* Reply banner inside bubble area */}
                                        {repliedMsg && (
                                            <View style={styles.repliedBanner}>
                                                <Icon name="corner-up-left" size={12} color="#554E40" />
                                                <Text style={styles.repliedBannerTxt} numberOfLines={1}>{repliedMsg.sender}: {repliedMsg.text || 'Contenuto multimediale'}</Text>
                                            </View>
                                        )}

                                        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                <Text style={[styles.msgSender, isMine && { color: '#C9A84C' }]}>{m.sender}</Text>
                                            </View>
                                            {m.text ? <Text style={styles.msgText}>{parseMarkdown(m.text)}</Text> : null}
                                            {m.voiceData && <VoiceMessageBubble src={m.voiceData} duration={m.voiceDuration} isMine={isMine} />}
                                            {m.poll && <PollMessage msg={m} user={user} onVote={vote} />}
                                            {m.imageData && <Image source={{ uri: m.imageData }} style={styles.msgImg} />}

                                            <View style={styles.msgMeta}>
                                                {m.edited && <Text style={styles.msgEdited}>(modificato)</Text>}
                                                <Text style={styles.msgTime}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                                {isMine && <Icon name="check" size={12} color="rgba(201,168,76,0.5)" />}
                                            </View>
                                        </View>

                                        {/* Reactions */}
                                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                                            <View style={styles.reactionsWrap}>
                                                {Object.entries(m.reactions).map(([emoji, usersArr]) => (
                                                    <TouchableOpacity key={emoji} style={[styles.reactionBadge, usersArr.includes(user.username) && styles.reactionBadgeMy]} onPress={() => reactMessage(m.id, emoji)}>
                                                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                                                        <Text style={[styles.reactionCount, usersArr.includes(user.username) && { color: '#C9A84C' }]}>{usersArr.length}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                </LinearGradient>

                {/* ── Action Banner (Replying/Editing) ── */}
                <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' }}>
                    {/* Replying / Editing banner */}
                    {(replyingTo || editingMsg) && (
                        <View style={styles.activeActionBanner}>
                            <Icon name={editingMsg ? "edit-2" : "message-square"} size={14} color="#C9A84C" />
                            <Text style={styles.activeActionTxt} numberOfLines={1}>
                                {editingMsg ? `Modifica messaggio` : `Risposta a ${replyingTo.sender}: ${replyingTo.text || 'Multimediale'}`}
                            </Text>
                            <TouchableOpacity onPress={() => { setReplyingTo(null); setEditingMsg(null); setDraft(''); }} style={{ padding: 4 }}>
                                <Icon name="x" size={16} color="#554E40" />
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={styles.inputArea}>
                        {!isRecording && (
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
                        )}
                        {!isRecording && (
                            <TextInput
                                style={styles.input}
                                placeholder={`Scrivi in #${activeChannel.name}...`}
                                placeholderTextColor="#554E40"
                                multiline
                                value={draft}
                                onChangeText={setDraft}
                                numberOfLines={1}
                                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                onKeyPress={(e) => {
                                    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                                        e.preventDefault();
                                        if (draft.trim()) {
                                            send(draft);
                                            setDraft('');
                                        }
                                    }
                                }}
                            />
                        )}
                        <VoiceRecorderButton
                            onSend={(data, dur) => send('', null, null, null, data, dur)}
                            onRecordingChange={setIsRecording}
                        />
                        {!isRecording && draft.trim() ? (
                            <TouchableOpacity style={[styles.sendBtn, styles.sendBtnActive]} onPress={() => { send(draft); setDraft(''); }}>
                                <Icon name="send" size={16} color="#111" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </View>}

            {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
            {!hideChatColumn && !IS_MOBILE && !rightCollapsed && (
                <View style={[styles.column, styles.rightPanel]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <TouchableOpacity onPress={() => setRightCollapsed(true)}>
                            <Icon name="chevron-right" size={18} color="#554E40" />
                        </TouchableOpacity>
                        <Text style={styles.rightTitle}>OCCUPANTI ONLINE — {onlineUsers.filter(u => u.status !== 'offline').length}</Text>
                    </View>
                    <ScrollView style={{ flex: 1 }}>
                        <TouchableOpacity style={styles.occupancyHeader} onPress={() => setExpanded(p => ({ ...p, users: !p.users }))}>
                            <Text style={styles.occupancyTitle}>DIPENDENTI</Text>
                            <Icon name={expanded.users ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                        </TouchableOpacity>
                        {expanded.users && [...onlineUsers].sort((a,b) => {
                            if (a.status === 'offline' && b.status !== 'offline') return 1;
                            if (a.status !== 'offline' && b.status === 'offline') return -1;
                            return a.username.localeCompare(b.username);
                        }).map((u, i) => {
                            const isOffline = u.status === 'offline';
                            return (
                                <View key={i} style={[styles.userRow, isOffline && { opacity: 0.5 }]}>
                                    <View style={styles.avatarWrapSmall}>
                                        {u.profilePic ? 
                                            <Image source={{ uri: u.profilePic }} style={styles.avatarImgSmall} /> :
                                            <View style={styles.avatarFallbackSmall}><Text style={styles.avatarFallbackTxtSmall}>{u.username[0]?.toUpperCase()}</Text></View>
                                        }
                                        <View style={[styles.userDot, { backgroundColor: statusColor(u.status) }]} />
                                    </View>
                                    <Text style={[styles.userRowName, isOffline ? { color: '#6E6960' } : { color: HOTELS.find(h => u.username.includes(h.name) || u.station.includes(h.id))?.color || '#C8C4B8' }]}>
                                        {u.username}
                                    </Text>
                                    {u.roomId && <Icon name="volume-2" size={12} color="#6B7FC4" />}
                                </View>
                            );
                        })}

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
    root: { flex: 1, flexDirection: 'row', backgroundColor: 'transparent', ...NO_SELECT, position: 'relative' },
    column: { height: '100%', borderRightWidth: 1, borderRightColor: 'rgba(201,168,76,0.06)' },

    hoverMenu: { position: 'absolute', top: -15, right: 10, backgroundColor: '#16140F', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 10, flexDirection: 'row', alignItems: 'center', padding: 4, gap: 4, zIndex: 100 },
    hoverMenuBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    infoModalBox: { width: 300, backgroundColor: '#100E0C', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#C9A84C', gap: 8 },
    infoTitle: { color: '#C9A84C', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
    infoLabel: { color: '#A8A090', fontSize: 14, fontWeight: '600' },

    leftTrapezoid: { position: 'absolute', top: '50%', left: 0, width: 24, height: 60, marginTop: -30, backgroundColor: '#1C1A12', borderTopRightRadius: 8, borderBottomRightRadius: 8, justifyContent: 'center', alignItems: 'center', zIndex: 100, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
    rightTrapezoid: { position: 'absolute', top: '50%', right: 0, width: 24, height: 60, marginTop: -30, backgroundColor: '#1C1A12', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, justifyContent: 'center', alignItems: 'center', zIndex: 100, borderLeftWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },

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
    sidebar: { width: 240, backgroundColor: 'rgba(12, 11, 9, 0.7)' },
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
    chatCol: { flex: 1, backgroundColor: 'rgba(20, 18, 16, 0.4)' },
    chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)', backgroundColor: 'rgba(20, 18, 14, 0.6)' },
    headerChName: { color: '#C8C4B8', fontSize: 18, fontWeight: '800', marginLeft: 8 },
    pdfBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', marginRight: 16, gap: 6 },
    pdfBtnTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1812', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#3A3630' },
    chatHeader: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    headerChName: { color: '#C8C4B8', fontWeight: '800', fontSize: 18 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    statusBadgeDot: { width: 8, height: 8, borderRadius: 4 },
    statusBadgeTxt: { color: '#C8C4B8', fontSize: 12, fontWeight: '600' },
    statusDetail: { position: 'absolute', top: 40, right: 0, width: 180, backgroundColor: '#1A1812', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', zIndex: 100 },
    statusDetailTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', marginBottom: 10 },
    statusDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    statusDetailLbl: { color: '#6E6960', fontSize: 12 },
    statusDetailVal: { fontWeight: '700', fontSize: 12 },

    messagesScroll: { flex: 1 },
    msgRow: { flexDirection: 'row', marginBottom: 8, width: '100%', position: 'relative' },
    msgRowMine: {},
    bubbleWrap: { maxWidth: '90%', alignItems: 'flex-start' },
    repliedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, opacity: 0.6 },
    repliedBannerTxt: { color: '#C8C4B8', fontSize: 13, fontWeight: '700' },
    bubble: { padding: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    bubbleOther: { backgroundColor: '#1A1812', borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    bubbleMine: { backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    msgSender: { color: '#6E6960', fontSize: 13, fontWeight: '800' },
    msgText: { color: '#C8C4B8', fontSize: 15, lineHeight: 22 },

    mdCode: { fontFamily: 'monospace', backgroundColor: '#11100D', padding: 4, borderRadius: 4, color: '#C9A84C' },
    mdBold: { fontWeight: 'bold', color: '#E8E4D8' },
    mdItalic: { fontStyle: 'italic' },
    mdH1: { fontSize: 20, fontWeight: '900', color: '#C9A84C', marginVertical: 4 },
    msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
    msgEdited: { color: '#554E40', fontSize: 10, fontStyle: 'italic', marginRight: 4 },
    msgTime: { color: '#3A3630', fontSize: 11, fontWeight: '600' },
    msgImg: { width: 280, height: 180, borderRadius: 12, marginTop: 8 },

    bubbleWrap: { maxWidth: '75%' },
    repliedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 4, opacity: 0.8 },
    repliedBannerTxt: { color: '#A8A090', fontSize: 12, fontStyle: 'italic' },
    reactionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    reactionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
    reactionBadgeMy: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.3)' },
    reactionEmoji: { fontSize: 12 },
    reactionCount: { color: '#6E6960', fontSize: 11, fontWeight: '700' },

    activeActionBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(201,168,76,0.05)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.06)' },
    activeActionTxt: { flex: 1, color: '#C8C4B8', fontSize: 13, fontStyle: 'italic' },

    inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12 },
    input: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, color: '#C8C4B8', fontSize: 16, maxHeight: SCREEN_H * 0.15 },
    plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    plusMenu: { position: 'absolute', bottom: 50, left: 0, width: 200, backgroundColor: '#1A1812', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', zIndex: 1000 },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8 },
    plusItemTxt: { color: '#C8C4B8', fontSize: 15, fontWeight: '600' },
    sendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    sendBtnActive: { backgroundColor: '#C9A84C' },

    // Right Panel
    rightPanel: { width: 240, backgroundColor: 'rgba(12, 11, 9, 0.7)', padding: 20 },
    rightTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    occupancyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    occupancyTitle: { flex: 1, color: '#6E6960', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    avatarWrapSmall: { width: 32, height: 32, borderRadius: 16, marginRight: 10, position: 'relative' },
    avatarImgSmall: { width: 32, height: 32, borderRadius: 16 },
    avatarFallbackSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1A1812', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)' },
    avatarFallbackTxtSmall: { color: '#C9A84C', fontSize: 13, fontWeight: '800' },
    userDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0C0B09' },
    userRowName: { flex: 1, fontSize: 14, fontWeight: '700' },
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
