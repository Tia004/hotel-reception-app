/**
 * HotelChat.js — v4.1.5
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
    TextInput, Image, Dimensions, Platform, Modal, Animated, FlatList, LayoutAnimation
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import MediaSettings from './MediaSettings';
import UserProfileCard, { statusColor } from './UserProfileCard';
import ImageLightbox from './ImageLightbox';
import { VoiceRecorderButton, VoiceMessageBubble } from './VoiceMessage';
import html2pdf from 'html2pdf.js';
import DynamicBackground from './DynamicBackground';
import { requestPermission, showMessageNotification } from '../utils/pushNotifications';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_MOBILE = SCREEN_W < 768;
// All emojis mapped statically via unicode ranges or static lists above the components

const NO_SELECT = Platform.OS === 'web' ? {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    msUserSelect: 'none'
} : {};

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

const getRecentEmoji = () => { try { if (typeof localStorage === 'undefined') return []; return JSON.parse(localStorage.getItem('gsa_recent_emoji') || '[]'); } catch { return []; } };
const saveRecentEmoji = (l) => { try { if (typeof localStorage !== 'undefined') localStorage.setItem('gsa_recent_emoji', JSON.stringify(l)); } catch { } };

// ─── Markdown Parser (full support) ────────────────────────────────────────
const parseMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, li) => {
        // Headings
        if (line.startsWith('#### ')) return <Text key={li} style={styles.mdH4}>{line.slice(5)}</Text>;
        if (line.startsWith('### ')) return <Text key={li} style={styles.mdH3}>{line.slice(4)}</Text>;
        if (line.startsWith('## ')) return <Text key={li} style={styles.mdH2}>{line.slice(3)}</Text>;
        if (line.startsWith('# ')) return <Text key={li} style={styles.mdH1}>{line.slice(2)}</Text>;
        // Blockquote
        if (line.startsWith('> ')) return <Text key={li} style={styles.mdBlockquote}>{line.slice(2)}</Text>;
        // List items
        if (/^[-*] /.test(line)) return <Text key={li} style={styles.mdListItem}>{'  •  '}{parseInline(line.slice(2))}</Text>;
        // Default line
        return <Text key={li}>{parseInline(line)}{li < lines.length - 1 ? '\n' : ''}</Text>;
    });
};
const parseInline = (text) => {
    if (!text) return null;
    const parts = text.split(/(```[^`]+```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/);
    return parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith('```') && p.endsWith('```')) return <Text key={i} style={styles.mdCode}>{p.slice(3, -3)}</Text>;
        if (p.startsWith('`') && p.endsWith('`')) return <Text key={i} style={styles.mdInlineCode}>{p.slice(1, -1)}</Text>;
        if (p.startsWith('**') && p.endsWith('**')) return <Text key={i} style={styles.mdBold}>{p.slice(2, -2)}</Text>;
        if (p.startsWith('*') && p.endsWith('*')) return <Text key={i} style={styles.mdItalic}>{p.slice(1, -1)}</Text>;
        if (p.startsWith('~~') && p.endsWith('~~')) return <Text key={i} style={styles.mdStrike}>{p.slice(2, -2)}</Text>;
        return <Text key={i}>{p}</Text>;
    });
};

// ─── Server Status Badge ──────────────────────────────────────────────────
const StatusBadge = ({ ping, status }) => {
    const color = status === 'Eccellente' ? '#23A559' : status === 'Buono' ? '#C9A84C' : '#ED4245';
    // Ensure no native tooltips or shifting layout
    return (
        <View style={styles.statusBadge}>
            <View style={[styles.statusBadgeDot, { backgroundColor: color }]} />
            <Text style={styles.statusBadgeTxt}>{ping ? `${ping}ms` : '...'}</Text>
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
            {/* Poll type badge */}
            <View style={[styles.waPollTypeBadge, poll.isMultiple && styles.waPollTypeBadgeMultiple]}>
                <Text style={styles.waPollTypeIcon}>{poll.isMultiple ? '☑️' : '🔘'}</Text>
                <Text style={styles.waPollTypeTxt}>{poll.isMultiple ? 'Scelta multipla' : 'Risposta singola'}</Text>
            </View>

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
export default function HotelChat({ socket, user, sidebarVisible, onToggleSidebar, availableRooms = [], onJoinRoom, onLogout, inCall, hideChatColumn, onChannelClick, currentRoomId, onOpenDebug }) {
    // Definizione locale dei dati emoji per evitare ReferenceError
    const GSA_EMOJI_DATA = [
        {
            name: 'Smileys',
            emoji: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖']
        },
        {
            name: 'Gesti',
            emoji: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🙏', '✍️', '💅', '💪', '🫀', '🧠', '👁️', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟']
        },
        {
            name: 'Animali',
            emoji: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🐊', '🦓', '🦍', '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🐃', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🕊️', '🐇', '🦝', '🦔', '🐉', '🐲', '🌵', '🌲', '🌴', '🍄', '🌊', '🌈', '⭐', '🌟', '☀️', '🌙', '⛅', '🌩️', '❄️', '🔥', '💧', '🌬️']
        },
        {
            name: 'Cibo',
            emoji: ['🍎', '🍏', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥙', '🧆', '🍿', '🍱', '🍣', '🍜', '🍝', '🍛', '🥟', '🦀', '🦞', '🦐', '🦑', '🪸', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍼', '🥛', '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾']
        },
        {
            name: 'Attività',
            emoji: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🥍', '🏏', '🪃', '⛳', '🪁', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🎮', '🎰', '🎲', '♟️', '🧩', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎻', '🎵', '🎶', '🎙️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎪', '🎠', '🎡', '🎢', '🎭', '🎪']
        },
        {
            name: 'Viaggio',
            emoji: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🚲', '🛴', '🛺', '🚁', '🛸', '⛵', '🚢', '🛥️', '⛽', '🚦', '🚧', '⚓', '✈️', '🛫', '🛬', '💺', '🛰️', '🚀', '🌍', '🌎', '🌏', '🗺️', '🏔️', '⛰️', '🌋', '🏕️', '🏖️', '🏗️', '🏘️', '🏚️', '🏛️', '🏟️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏧', '🏨', '🏩', '🏪', '🏫', '🏬', '🗼', '🗽', '⛪', '🕌', '🕍', '⛩️', '🕋', '🌃', '🌆', '🌇', '🌉', '🌌', '🌠']
        },
        {
            name: 'Oggetti',
            emoji: ['📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📞', '☎️', '📺', '📻', '🧭', '⏱️', '⏲️', '⏰', '⌚', '🔋', '🔌', '💡', '🔦', '🕯️', '🔑', '🗝️', '🔒', '🔓', '🔨', '⚒️', '🛠️', '🔧', '🔩', '⚙️', '⚖️', '🔗', '🧲', '🪜', '🧪', '🔬', '🔭', '💉', '💊', '🩹', '📧', '📦', '📫', '📮', '✏️', '📝', '📁', '📂', '📅', '📆', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '✂️', '🔒', '💰', '💳', '🪙', '📚', '📖', '🔖', '🏷️', '📰', '🗞️', '📃']
        },
        {
            name: 'Simboli',
            emoji: ['✅', '❌', '⭕', '🚫', '💯', '🔔', '🔕', '📢', '📣', '🔊', '🔇', '🔈', '🔉', '🎵', '🎶', '💬', '💭', '🗨️', '🗯️', 'ℹ️', '🆕', '🆙', '🆒', '🆓', '🆖', '🆗', '🆘', '🔝', '🔛', '🔜', '🔚', '🆚', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🈷️', '🈶', '🈯', '🉑', '🈸', '🈺', '🈳', '🈻', '🚾', '🈴', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔲', '🔳', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '✔️', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '🔃', '🔄']
        }
    ];
    const [activeChannel, setActiveChannel] = useState(ALL_CHANNELS[0]);
    const [messages, setMessages] = useState({});
    const [pinned, setPinned] = useState({});
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [activeRooms, setActiveRooms] = useState([]);
    const [expanded, setExpanded] = useState({ voice: true, saved: false, users: true, rooms: true, pinned: false });
    const [expandedHotels, setExpandedHotels] = useState({ duchessa: true, blumen: false, santorsola: false });

    // Per-channel state isolation
    const [channelDrafts, setChannelDrafts] = useState({}); // { channelId: { text: string, replyingTo: object } }
    const [draft, setDraft] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);

    // Auto-save draft whenever it changes
    useEffect(() => {
        if (!activeChannel && !currentRoomId) return;
        const id = activeChannel ? activeChannel.id : currentRoomId;
        setChannelDrafts(prev => ({
            ...prev,
            [id]: { text: draft, replyingTo }
        }));
    }, [draft, replyingTo, activeChannel?.id, currentRoomId]);

    // Restore draft when switching channel or room
    useEffect(() => {
        const id = activeChannel ? activeChannel.id : currentRoomId;
        if (id && channelDrafts[id]) {
            setDraft(channelDrafts[id].text);
            setReplyingTo(channelDrafts[id].replyingTo);
        } else {
            setDraft('');
            setReplyingTo(null);
        }
    }, [activeChannel?.id, currentRoomId]);

    const [savedChats, setSavedChats] = useState([]);
    const [editingMsg, setEditingMsg] = useState(null);

    // UI States
    const [profileVisible, setProfileVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [infoModal, setInfoModal] = useState(null);
    const [alertMsg, setAlertMsg] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [plusVisible, setPlusVisible] = useState(false);
    const [gifSearchVisible, setGifSearchVisible] = useState(false);
    const [gifSearch, setGifSearch] = useState('');
    const [gifResults, setGifResults] = useState([]);



    const APP_VERSION = "4.1.5";
    const [pinnedExpanded, setPinnedExpanded] = useState(false);

    // Server Keep-Alive
    useEffect(() => {
        const ping = () => fetch('/ping').catch(() => { });
        const interval = setInterval(ping, 5 * 60 * 1000); // 5 min
        ping();
        return () => clearInterval(interval);
    }, []);
    const [pollVisible, setPollVisible] = useState(false);
    const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''], isMultiple: false });

    const [pinnedVisible, setPinnedVisible] = useState(false);
    const [ping, setPing] = useState(null);
    const [pingStatus, setPingStatus] = useState('...');



    const leftCollapsed = useRef(false); // local ref to track since state is async? Or just keep state
    const [leftCollapsedState, setLeftCollapsed] = useState(IS_MOBILE);
    const [rightCollapsedState, setRightCollapsed] = useState(IS_MOBILE);

    const toggleLeft = () => {
        const next = !leftCollapsedState;
        setLeftCollapsed(next);
        if (IS_MOBILE && !next) { // Opening left
            setRightCollapsed(true);
        }
    };
    const toggleRight = () => {
        const next = !rightCollapsedState;
        setRightCollapsed(next);
        if (IS_MOBILE && !next) { // Opening right
            setLeftCollapsed(true);
        }
    };

    // We animate margin from 0 to negative width to slide without squishing text
    const leftAnim = useRef(new Animated.Value(0)).current;
    const rightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(leftAnim, { toValue: leftCollapsedState ? -260 : 0, useNativeDriver: false, damping: 20, stiffness: 120 }).start();
    }, [leftCollapsedState]);

    useEffect(() => {
        Animated.spring(rightAnim, { toValue: rightCollapsedState ? -280 : 0, useNativeDriver: false, damping: 20, stiffness: 120 }).start();
    }, [rightCollapsedState]);

    const leftRotate = leftCollapsedState ? '180deg' : '0deg';
    const rightRotate = rightCollapsedState ? '180deg' : '0deg';

    const [hoveredMsg, setHoveredMsg] = useState(null);
    const [msgActionMenu, setMsgActionMenu] = useState(null); // The chevron-down menu
    const [emojiPickerMsg, setEmojiPickerMsg] = useState(null); // Quick reactions (+)
    const [reactionPickerMsg, setReactionPickerMsg] = useState(null); // Used for Emojis
    const [fullPickerVisible, setFullPickerVisible] = useState(null); // Full Unicode picker
    const [forwardTarget, setForwardTarget] = useState(null);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState([]);
    const [roomArchives, setRoomArchives] = useState([]); // { roomId, mtime }
    const [viewingArchive, setViewingArchive] = useState(null); // { roomId, messages }
    const prevRoomsCount = useRef(0);

    const playSound = async (type) => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                type === 'join'
                    ? { uri: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' }
                    : { uri: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3' }
            );
            await sound.playAsync();
            setTimeout(() => sound.unloadAsync(), 2000);
        } catch (e) { console.log('Sound error', e); }
    };

    useEffect(() => {
        if (activeRooms.length > prevRoomsCount.current) playSound('join');
        else if (activeRooms.length < prevRoomsCount.current) playSound('leave');
        prevRoomsCount.current = activeRooms.length;
    }, [activeRooms.length]);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        // Clear cross-chat states when switching channels
        setReplyingTo(null);
        setEditingMsg(null);
        setDraft('');
        setEmojiPickerMsg(null);
        setMsgActionMenu(null);
    }, [activeChannel]);

    // Handle draft persistence when channel changes
    useEffect(() => {
        if (!activeChannel) return;

        // Load current channel draft
        const currentData = channelDrafts[activeChannel.id] || { text: '', replyingTo: null };
        setDraft(currentData.text);
        setReplyingTo(currentData.replyingTo);
    }, [activeChannel?.id]);

    useEffect(() => {
        if (!activeChannel) return;
        setChannelDrafts(prev => ({
            ...prev,
            [activeChannel.id]: { text: draft, replyingTo: replyingTo }
        }));
    }, [draft, replyingTo, activeChannel?.id]);

    // Forward message function
    const forwardMessage = (targetChannel) => {
        if (!forwardTarget || !socket) return;
        if (targetChannel.id === activeChannel?.id) {
            setForwardTarget(null);
            return; // Cannot forward to same channel
        }
        socket.emit('channel-message', {
            channelId: targetChannel.id,
            text: `↪️ Inoltrato da ${forwardTarget.sender}:\n${forwardTarget.text || ''}`,
            imageData: forwardTarget.imageData || null,
            gifUrl: forwardTarget.gifUrl || null,
            replyTo: null
        });
        setForwardTarget(null);
    };

    // Click outside to close menus
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const onClk = (e) => {
            setEmojiPickerMsg(null);
            setMsgActionMenu(null);
            setReactionPickerMsg(null);
            setPlusVisible(false);
        };
        document.addEventListener('click', onClk);
        return () => { document.removeEventListener('click', onClk); };
    }, []);

    // ── Render Modals ───────────────────────────────────────────────────
    const renderModals = () => (
        <>
            {/* Forward Modal */}
            <Modal visible={!!forwardTarget} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setForwardTarget(null)}>
                    <TouchableOpacity activeOpacity={1} style={styles.infoModalBox}>
                        <Text style={styles.infoTitle}>INOLTRA MESSAGGIO</Text>
                        <Text style={[styles.infoLabel, { marginBottom: 16 }]}>Seleziona un canale di destinazione:</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {(ALL_CHANNELS || []).filter(ch => ch.id !== activeChannel?.id).map(ch => (
                                <TouchableOpacity key={ch.id} style={styles.forwardItem} onPress={() => forwardMessage(ch)}>
                                    <View style={[styles.hotelDot, { backgroundColor: HOTELS.find(h => ch.id.startsWith(h.id))?.color }]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.forwardItemTxt}>{ch.name}</Text>
                                        <Text style={{ color: '#554E40', fontSize: 11 }}>{HOTELS.find(h => ch.id.startsWith(h.id))?.name}</Text>
                                    </View>
                                    <Icon name="corner-up-right" size={12} color="#554E40" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Profile & Settings Modals */}
            <UserProfileCard visible={profileVisible} onClose={() => setProfileVisible(false)} user={user} socket={socket} onLogout={onLogout} />
            <MediaSettings visible={settingsVisible} onClose={() => setSettingsVisible(false)} user={user} />

            {/* Poll Creator */}
            <Modal visible={pollVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <TouchableOpacity activeOpacity={1} style={[styles.infoModalBox, { width: 360 }]} onStartShouldSetResponder={() => true}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={styles.infoTitle}>CREA SONDAGGIO</Text>
                            <TouchableOpacity onPress={() => setPollVisible(false)}><Icon name="x" size={18} color="#554E40" /></TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.input, { marginBottom: 12 }]} placeholder="Domanda del sondaggio..."
                            placeholderTextColor="#554E40"
                            value={pollDraft.question}
                            onChangeText={t => setPollDraft(p => ({ ...p, question: t }))}
                        />
                        <View style={{ gap: 8, marginBottom: 12 }}>
                            {pollDraft.options.map((opt, i) => (
                                <TextInput key={i} style={[styles.input, { height: 40 }]} placeholder={`Opzione ${i + 1}`} placeholderTextColor="#3A3630"
                                    value={opt}
                                    onChangeText={t => {
                                        const next = [...pollDraft.options];
                                        next[i] = t;
                                        setPollDraft(p => ({ ...p, options: next }));
                                    }}
                                />
                            ))}
                        </View>
                        <TouchableOpacity style={styles.hoverActionItem} onPress={() => setPollDraft(p => ({ ...p, options: [...p.options, ''] }))}>
                            <Icon name="plus" size={14} color="#C9A84C" /><Text style={styles.hoverActionTxt}>Aggiungi Opzione</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 4 }}>
                            <Text style={[styles.hoverActionTxt, { fontSize: 13, fontWeight: '700' }]}>Risposta Multipla</Text>
                            <TouchableOpacity
                                onPress={() => setPollDraft(p => ({ ...p, isMultiple: !p.isMultiple }))}
                                style={{
                                    width: 44, height: 24, borderRadius: 12,
                                    backgroundColor: pollDraft.isMultiple ? '#C9A84C' : '#2A2217',
                                    justifyContent: 'center', paddingHorizontal: 4
                                }}
                            >
                                <Animated.View style={{
                                    width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF',
                                    transform: [{ translateX: pollDraft.isMultiple ? 20 : 0 }]
                                }} />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={[styles.createBtn, { marginTop: 20 }]} onPress={() => {
                            if (pollDraft.question.trim() && pollDraft.options.filter(o => o.trim()).length >= 2) {
                                send('', null, null, { question: pollDraft.question, options: pollDraft.options.filter(o => o.trim()), isMultiple: pollDraft.isMultiple });
                                setPollVisible(false);
                                setPollDraft({ question: '', options: ['', ''], isMultiple: false });
                            }
                        }}><Text style={styles.createBtnTxt}>INVIA SONDAGGIO</Text></TouchableOpacity>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Message Info Modal */}
            <Modal visible={!!infoModal} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInfoModal(null)}>
                    <View style={styles.infoModalBox}>
                        <Text style={styles.infoTitle}>DETTAGLI MESSAGGIO</Text>
                        <Text style={styles.infoLabel}>Inviato da: <Text style={{ color: '#E8E4D8' }}>{infoModal?.sender}</Text></Text>
                        <Text style={styles.infoLabel}>Ora invio: <Text style={{ color: '#E8E4D8' }}>{infoModal?.time}</Text></Text>

                        {infoModal?.deliveredTo?.length > 0 && (
                            <>
                                <View style={{ height: 1, backgroundColor: 'rgba(201,168,76,0.1)', marginVertical: 12 }} />
                                <Text style={[styles.infoLabel, { color: '#6E6960', marginBottom: 8 }]}>CONSEGNATO A:</Text>
                                <ScrollView style={{ maxHeight: 100 }}>
                                    {(infoModal?.deliveredTo || []).map((d, i) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={{ color: '#A8A090', fontSize: 13 }}>• {d.user}</Text>
                                            <Text style={{ color: '#3A3630', fontSize: 11 }}>{d.time}</Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {infoModal?.readBy?.length > 0 && (
                            <>
                                <View style={{ height: 1, backgroundColor: 'rgba(201,168,76,0.1)', marginVertical: 12 }} />
                                <Text style={[styles.infoLabel, { color: '#C9A84C', marginBottom: 8 }]}>LETTO DA:</Text>
                                <ScrollView style={{ maxHeight: 150 }}>
                                    {(infoModal?.readBy || []).map((r, i) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={{ color: '#E8E4D8', fontSize: 13, fontWeight: '600' }}>• {r.user}</Text>
                                            <Text style={{ color: '#C9A84C', fontSize: 11 }}>{r.time}</Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                        <Text style={[styles.infoLabel, { marginTop: 12, fontSize: 10, color: '#333' }]}>ID: {infoModal?.id}</Text>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Archive Viewer Modal */}
            <Modal visible={!!viewingArchive} transparent animationType="slide">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setViewingArchive(null)}>
                    <View style={styles.infoModalBox} onStartShouldSetResponder={() => true}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={styles.infoTitle}>ARCHIVIO ROOM #{viewingArchive?.roomId}</Text>
                            <TouchableOpacity onPress={() => setViewingArchive(null)}>
                                <Icon name="x" size={18} color="#554E40" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {viewingArchive?.messages?.length > 0 ? viewingArchive.messages.map((m, i) => (
                                <View key={i} style={styles.archiveMsgRow}>
                                    <Text style={styles.archiveMsgSender}>{m.sender}:</Text>
                                    <Text style={styles.archiveMsgTxt}>{m.text}</Text>
                                    <Text style={styles.archiveMsgTime}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                            )) : (
                                <Text style={styles.emptyArchiveTxt}>Nessun messaggio in questa sessione.</Text>
                            )}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Delete Alert */}
            <Modal visible={!!deleteTarget} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDeleteTarget(null)}>
                    <View style={styles.infoModalBox}>
                        <Text style={[styles.infoTitle, { color: '#E57373' }]}>ELIMINA MESSAGGIO?</Text>
                        <Text style={styles.infoLabel}>L'azione è irreversibile per tutti i membri del canale.</Text>
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => setDeleteTarget(null)}>
                                <Text style={{ color: '#C8C4B8', fontWeight: '700' }}>ANNULLA</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: '#E57373', padding: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => { deleteMessage(deleteTarget); setDeleteTarget(null); }}>
                                <Text style={{ color: '#FFF', fontWeight: '900' }}>ELIMINA</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
            {selectedImage && (() => {
                const channelMsgs = messages[activeChannel.id] || [];
                const allImages = channelMsgs
                    .filter(m => m.imageData && !m.text?.startsWith('📄'))
                    .map(m => m.imageData);
                const currentIndex = allImages.indexOf(selectedImage);
                return (
                    <ImageLightbox
                        visible={!!selectedImage}
                        images={allImages}
                        initialIndex={currentIndex >= 0 ? currentIndex : 0}
                        onClose={() => setSelectedImage(null)}
                    />
                );
            })()}
        </>
    );

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
        requestPermission(); // Ask for push notification permission

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
            // Push notification when sender is not current user
            if (message.sender !== user.username) {
                const ch = ALL_CHANNELS.find(c => c.id === channelId);
                const hotel = HOTELS.find(h => channelId.startsWith(h.id));
                // Force notification even if tab is visible if it's a direct mention or important?
                // For now, let's just make it more reliable.
                showMessageNotification(message.sender, ch?.name || channelId, hotel?.name || '', message.text || '🎵 Vocale');
            }
        });

        socket.on('user-joined-room', ({ username }) => {
            if (username !== user.username) {
                showRoomNotification('joined', username, 'nella stanza vocale');
            }
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

        socket.on('read-receipt-update', ({ channelId, reader, receipts, type }) => {
            setMessages(prev => ({
                ...prev,
                [channelId]: (prev[channelId] || []).map(m => {
                    const update = receipts.find(r => r.messageId === m.id);
                    if (update) {
                        const field = type === 'delivered' ? 'deliveredTo' : 'readBy';
                        const existing = m[field] || [];
                        if (!existing.some(r => (typeof r === 'string' ? r : r.user) === (typeof update.receipt === 'string' ? update.receipt : update.receipt.user))) {
                            return { ...m, [field]: [...existing, update.receipt] };
                        }
                    }
                    return m;
                })
            }));
        });

        socket.on('message-deleted', ({ channelId, messageId }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).filter(m => m.id !== messageId)
            }));
            // Also remove from saved messages if it was saved
            setSavedChats(s => s.filter(sc => sc.id !== messageId));
        });

        socket.on('message-reacted', ({ channelId, messageId, reactions }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, reactions } : m)
            }));
        });

        socket.on('message-pinned', ({ channelId, message }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m => m.id === message.id ? { ...m, pinned: true } : m)
            }));
            setPinned(p => {
                const existing = p[channelId] || [];
                if (existing.find(m => m.id === message.id)) return p;
                return { ...p, [channelId]: [message, ...existing] };
            });
        });

        socket.on('message-unpinned', ({ channelId, messageId }) => {
            setMessages(p => ({
                ...p, [channelId]: (p[channelId] || []).map(m => m.id === messageId ? { ...m, pinned: false } : m)
            }));
            setPinned(p => ({
                ...p, [channelId]: (p[channelId] || []).filter(m => m.id !== messageId)
            }));
        });

        socket.on('voice-archives', (list) => {
            setRoomArchives(list);
        });

        // Request voice archives on mount
        socket.emit('get-voice-archives');

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
            socket.off('read-receipt-update');
            clearInterval(i);
        };
    }, [socket]);

    // Auto mark messages as read when channel is viewed
    useEffect(() => {
        if (!socket || !activeChannel) return;
        const channelMsgs = messages[activeChannel.id] || [];
        const unreadIds = channelMsgs
            .filter(m => m.sender !== user.username && !(m.readBy || []).includes(user.username))
            .map(m => m.id);
        if (unreadIds.length > 0) {
            socket.emit('mark-read', { channelId: activeChannel.id, messageIds: unreadIds });
        }
    }, [messages[activeChannel?.id], activeChannel, socket]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages[activeChannel?.id], activeChannel]);

    // Note: click-outside and right-click handling is done above in the first useEffect

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

            {infoModal && (() => {
                const readBy = (infoModal.readBy || []);
                const deliveredTo = (infoModal.deliveredTo || []);
                const readNames = readBy.map(r => typeof r === 'string' ? r : r.user);
                const deliveredNames = deliveredTo.map(d => typeof d === 'string' ? d : d.user);
                const allOthers = onlineUsers.filter(u => u.username !== infoModal.sender);
                const notReceived = allOthers.filter(u => !readNames.includes(u.username) && !deliveredNames.includes(u.username));
                return (
                    <Modal visible transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
                        <TouchableOpacity style={styles.modalOverlay} onPress={() => setInfoModal(null)}>
                            <TouchableOpacity activeOpacity={1} style={[styles.infoModalBox, { width: 340 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={styles.infoTitle}>DETTAGLI MESSAGGIO</Text>
                                    <TouchableOpacity onPress={() => setInfoModal(null)}><Icon name="x" size={16} color="#554E40" /></TouchableOpacity>
                                </View>
                                <Text style={styles.infoLabel}>Inviato da: <Text style={{ color: '#C9A84C', fontWeight: '800' }}>{infoModal.sender}</Text></Text>
                                <Text style={styles.infoLabel}>Ora: <Text style={{ color: '#C8C4B8' }}>{new Date(infoModal.timestamp).toLocaleString('it-IT')}</Text></Text>
                                {infoModal.text && <Text style={[styles.infoLabel, { marginTop: 6 }]}>Testo: <Text style={{ color: '#C8C4B8' }}>{infoModal.text.substring(0, 80)}{infoModal.text.length > 80 ? '...' : ''}</Text></Text>}
                                <Text style={[styles.infoLabel, { marginTop: 6, fontSize: 10 }]}>ID: {infoModal.id}</Text>

                                {/* Read by */}
                                <View style={{ height: 1, backgroundColor: 'rgba(201,168,76,0.15)', marginVertical: 12 }} />
                                <Text style={{ color: '#C9A84C', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 }}>✓✓ LETTO DA ({readNames.length})</Text>
                                {readNames.length > 0 ? readNames.map((name, i) => (
                                    <Text key={i} style={{ color: '#C8C4B8', fontSize: 12, marginLeft: 8, marginBottom: 2 }}>• {name}</Text>
                                )) : <Text style={{ color: '#444', fontSize: 11, fontStyle: 'italic', marginLeft: 8 }}>Nessuno</Text>}

                                {/* Delivered */}
                                <Text style={{ color: '#6E6960', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 6 }}>✓✓ CONSEGNATO A ({deliveredNames.length})</Text>
                                {deliveredNames.length > 0 ? deliveredNames.map((name, i) => (
                                    <Text key={i} style={{ color: '#A8A090', fontSize: 12, marginLeft: 8, marginBottom: 2 }}>• {name}</Text>
                                )) : <Text style={{ color: '#444', fontSize: 11, fontStyle: 'italic', marginLeft: 8 }}>Nessuno</Text>}

                                {/* Not received */}
                                <Text style={{ color: '#554E40', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 6 }}>✗ ONLINE MA NON RICEVUTO ({notReceived.length})</Text>
                                {notReceived.length > 0 ? notReceived.map((u, i) => (
                                    <Text key={i} style={{ color: '#554E40', fontSize: 12, marginLeft: 8, marginBottom: 2 }}>• {u.username}</Text>
                                )) : (onlineUsers.length > 1 ? <Text style={{ color: '#444', fontSize: 11, fontStyle: 'italic', marginLeft: 8 }}>Tutti i presenti hanno ricevuto</Text> : <Text style={{ color: '#444', fontSize: 11, fontStyle: 'italic', marginLeft: 8 }}>In attesa di altri utenti...</Text>)}

                                <TouchableOpacity style={[styles.createBtn, { marginTop: 16 }]} onPress={() => setInfoModal(null)}>
                                    <Text style={styles.createBtnTxt}>CHIUDI</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </Modal>
                );
            })()}

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

            {/* Sidebar toggle tabs are now children of the sidebars themselves to move with them */}

            {/* ── LEFT SIDEBAR ────────────────────────────────────────── */}
            {true && (
                <View style={{ position: 'relative', height: '100%', flexDirection: 'row', zIndex: IS_MOBILE ? 200 : 10 }}>
                    <Animated.View style={[
                        styles.column,
                        styles.sidebar,
                        { width: 260, marginLeft: leftAnim },
                        IS_MOBILE && { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 200, backgroundColor: '#141210' }
                    ]}>
                        <View style={{ width: 260, height: '100%', position: 'absolute', right: 0, top: 0 }}>
                            <LinearGradient colors={['#1C1A12', '#141210']} style={styles.sidebarHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Image source={require('../assets/logo.png')} style={{ width: 26, height: 26, resizeMode: 'contain' }} />
                                    <Text style={styles.brandName}>CHAT v4.1.5</Text>

                                </View>
                            </LinearGradient>

                            <ScrollView style={{ flex: 1 }}>
                                <View style={styles.navHotelRow}>
                                    <Icon name="building" size={14} color="#6E6960" />
                                    <Text style={styles.hotelLbl}>HOTEL DISPONIBILI</Text>
                                </View>

                                {HOTELS.map(h => {
                                    const isExpanded = !!expandedHotels[h.id];
                                    return (
                                        <View key={h.id}>
                                            <TouchableOpacity
                                                style={[styles.chRow, isExpanded && styles.chRowActive]}
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    setExpandedHotels(prev => ({ ...prev, [h.id]: !isExpanded }));
                                                }}
                                            >
                                                <View style={[styles.hotelDot, { backgroundColor: h.color }]} />
                                                <Text style={[styles.chName, isExpanded && { color: '#C9A84C' }]}>{h.name}</Text>
                                                <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={12} color="#554E40" />
                                            </TouchableOpacity>

                                            {isExpanded && h.channels.map(ch => (
                                                <TouchableOpacity
                                                    key={ch.id}
                                                    style={[styles.chRow, { paddingLeft: 36, paddingVertical: 8 }, activeChannel?.id === ch.id && { backgroundColor: 'rgba(201,168,76,0.05)' }]}
                                                    onPress={() => {
                                                        setActiveChannel(ch);
                                                        onChannelClick?.();
                                                    }}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <Icon name={ch.name.toLowerCase() === 'generale' ? 'hash' : ch.name.toLowerCase() === 'media' ? 'image' : 'bell'} size={14} color={activeChannel?.id === ch.id ? '#C9A84C' : '#6E6960'} />
                                                        <Text style={[styles.chName, { fontSize: 13, marginLeft: 6, color: activeChannel?.id === ch.id ? '#C9A84C' : '#6E6960' }]}>
                                                            {ch.name}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    );
                                })}

                                <View style={[styles.navHotelRow, { marginTop: 20 }]}>
                                    <Icon name="speaker" size={14} color="#6E6960" />
                                    <Text style={styles.hotelLbl}>STANZE VOCALI FISSE</Text>
                                </View>

                                {['Duchessa Vocale', 'Blumen Vocale', 'SantOrsola Vocale', 'Stanza Generale'].map((name, idx) => {
                                    const ids = ['duchessa-voice', 'blumen-voice', 'santorsola-voice', 'generale-voice'];
                                    const rid = ids[idx];
                                    const room = activeRooms.find(r => r.id === rid);
                                    const roomUsers = onlineUsers.filter(u => u.roomId === rid);
                                    const isActive = currentRoomId === rid;

                                    return (
                                        <TouchableOpacity
                                            key={rid}
                                            style={[styles.chRow, isActive && styles.chRowActive]}
                                            onPress={() => onJoinRoom(rid)}
                                        >
                                            <Icon name="mic" size={14} color={isActive ? '#C9A84C' : '#554E40'} />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={[styles.chName, isActive && { color: '#C9A84C' }]}>{name.toUpperCase()}</Text>
                                                {room && room.peerCount > 0 && (
                                                    <Text style={{ color: '#6E6960', fontSize: 10 }}>{room.peerCount} partecipanti</Text>
                                                )}
                                            </View>
                                            {room && room.peerCount > 0 && (
                                                <View style={{ flexDirection: 'row', gap: -6 }}>
                                                    {room.peers.slice(0, 3).map((p, pi) => (
                                                        <View key={pi} style={[styles.userAvatarSmall, { width: 18, height: 18, borderWidth: 1, borderColor: '#111' }]}>
                                                            <Text style={{ fontSize: 8, color: '#C9A84C' }}>{p.username[0].toUpperCase()}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.05)' }}>
                                <TouchableOpacity style={styles.avatarBtn} onPress={() => setProfileVisible(true)}>
                                    <View style={[styles.avatar, { borderRadius: 12, borderWidth: 2, borderColor: '#C9A84C', overflow: 'hidden' }]}>
                                        {user.profilePic ? <Image source={{ uri: user.profilePic }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Text style={styles.avatarTxt}>{user.username[0].toUpperCase()}</Text>}
                                        <View style={[styles.statusDot, { backgroundColor: statusColor(onlineUsers.find(u => u.username === user.username)?.status || 'online') }]} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.userName}>{user.username}</Text>
                                        <Text style={styles.userStat}>{user.station || 'Online'}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.gearBtn}>
                                        <Icon name="settings" size={16} color="#554E40" />
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Unified Rhombus Tab (Left) - Always visible because its parent isn't absolute overflow hidden! */}
                    <View style={[
                        styles.externalTab,
                        styles.leftExternalTab,
                        { left: '100%', position: 'absolute', marginLeft: leftAnim }
                    ]}>
                        <TouchableOpacity
                            onPress={toggleLeft}
                            activeOpacity={0.8}
                            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
                        >
                            <View style={{ transform: [{ rotate: leftRotate }] }}>
                                <Icon name="chevron-left" size={16} color="#C9A84C" />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── CENTER CHAT ─────────────────────────────────────────── */}
            {!hideChatColumn && <View style={[styles.column, styles.chatCol]}>
                <View style={styles.chatHeader}>
                    <Icon name="hash" size={20} color="#554E40" />
                    <Text style={styles.headerChName}>{activeChannel.name}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={styles.pdfBtn} onPress={exportChatPDF}>
                        <Icon name="download" size={16} color="#C9A84C" />
                        <Text style={styles.pdfBtnTxt}>PDF</Text>
                    </TouchableOpacity>
                    <StatusBadge ping={ping} status={pingStatus} />
                </View>

                {isSelectMode && (
                    <View style={styles.selectHeaderBar}>
                        <Text style={styles.selectCountTxt}>{selectedMsgIds.length} selezionati</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                                style={styles.selectActionBtn}
                                onPress={() => {
                                    const allMsgs = messages[activeChannel.id] || [];
                                    const selectedTexts = allMsgs
                                        .filter(m => selectedMsgIds.includes(m.id))
                                        .map(m => `[${m.sender}]: ${m.text || ''}`)
                                        .join('\n');
                                    try { navigator.clipboard?.writeText(selectedTexts); } catch (e) { }
                                    setIsSelectMode(false);
                                    setSelectedMsgIds([]);
                                }}
                            >
                                <Icon name="copy" size={12} color="#111" />
                                <Text style={styles.selectActionBtnTxt}>Copia</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.selectActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#554E40' }]}
                                onPress={() => { setIsSelectMode(false); setSelectedMsgIds([]); }}
                            >
                                <Text style={[styles.selectActionBtnTxt, { color: '#C8C4B8' }]}>Annulla</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}



                <LinearGradient colors={['rgba(12, 11, 9, 0.6)', 'rgba(20, 18, 14, 0.7)']} style={{ flex: 1 }}>
                    <ScrollView ref={scrollRef} style={styles.messagesScroll} contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}>
                        {(messages[activeChannel.id] || []).length === 0 && (
                            <View style={styles.emptyChat}>
                                <View style={styles.emptyChatIcon}>
                                    <Icon name="message-square" size={32} color="rgba(201,168,76,0.3)" />
                                </View>
                                <Text style={styles.emptyChatTitle}>Benvenuto in #{activeChannel.name}</Text>
                                <Text style={styles.emptyChatSub}>Questo è l'inizio della conversazione. Scrivi un messaggio per iniziare!</Text>
                            </View>
                        )}
                        {(messages[activeChannel.id] || []).map(m => {
                            const isMine = m.sender === user.username;
                            const repliedMsg = m.replyTo ? (messages[activeChannel.id] || []).find(rm => rm.id === m.replyTo) : null;

                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    nativeID={`msg-${m.id}`}
                                    activeOpacity={isSelectMode ? 0.7 : 1}
                                    style={[
                                        styles.msgRow,
                                        isMine && styles.msgRowMine,
                                        isSelectMode && selectedMsgIds.includes(m.id) && { backgroundColor: 'rgba(201,168,76,0.12)' }
                                    ]}
                                    onPress={() => {
                                        if (isSelectMode) {
                                            setSelectedMsgIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]);
                                        }
                                    }}
                                >

                                    <View
                                        style={[
                                            styles.bubbleWrap,
                                            isMine ? styles.bubbleWrapMine : styles.bubbleWrapOther
                                        ]}
                                        {...(Platform.OS === 'web' ? {
                                            onMouseEnter: () => setHoveredMsg(m.id),
                                            onMouseLeave: () => { if (emojiPickerMsg !== m.id && msgActionMenu !== m.id) setHoveredMsg(null); },
                                            onContextMenu: (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setEmojiPickerMsg(m.id);
                                            },
                                            onDoubleClick: () => setReplyingTo(m)
                                        } : {})}
                                    >
                                        {/* Lateral Reaction Trigger (WhatsApp Style) - Moved inside Wrap for stability */}
                                        {hoveredMsg === m.id && !isSelectMode && (
                                            <TouchableOpacity
                                                style={[
                                                    styles.reactionSideBtn,
                                                    isMine ? { left: -42 } : { right: -42 }
                                                ]}
                                                onPress={() => onReactionClick(m)}
                                            >
                                                <Icon name="emoji" size={18} color="#6E6960" />
                                            </TouchableOpacity>
                                        )}
                                        {/* Caret / Dropdown Arrow (INSIDE BUBBLE) */}
                                        {hoveredMsg === m.id && !isSelectMode && (
                                            <View style={styles.bubbleCaretWrap}>
                                                <LinearGradient 
                                                    colors={[isMine ? '#28241C' : '#1C1A16', 'transparent']} 
                                                    start={{ x: 1, y: 0 }} 
                                                    end={{ x: 0, y: 1 }} 
                                                    style={styles.bubbleCaretGradient} 
                                                />
                                                <TouchableOpacity 
                                                    style={styles.bubbleCaret}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        onMsgAction(m, e);
                                                    }}
                                                >
                                                    <Icon name="chevron-down" size={16} color="rgba(200,200,200,0.8)" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {/* Hover Actions Panel - (Removed hoverEmojiBtn, kept for logic if needed elsewhere but mostly superseded by lateral) */}
                                        {false && hoveredMsg === m.id && !isSelectMode && (
                                            <View style={[
                                                styles.msgHoverActions,
                                                isMine ? { left: -44, flexDirection: 'row-reverse' } : { right: -44, flexDirection: 'row' }
                                            ]}>
                                                <TouchableOpacity
                                                    style={styles.msgCaretBtn}
                                                    onPress={(e) => onMsgAction(m, e)}
                                                >
                                                    <Icon name="chevron-down" size={14} color="#C9A84C" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {/* EMOJI PICKER (Quick Reactions) */}
                                        {emojiPickerMsg === m.id && (
                                            <View style={[styles.msgEmojiPicker, isMine ? styles.msgEmojiPickerLeft : styles.msgEmojiPickerRight]}>
                                                {['❤️', '👍', '🔥', '👏', '😂', '😮'].map(emo => (
                                                    <TouchableOpacity key={emo} onPress={() => { reactMessage(m.id, emo); setEmojiPickerMsg(null); }} style={{ padding: 6 }}>
                                                        <Text style={{ fontSize: 18 }}>{emo}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                                <TouchableOpacity onPress={() => { setFullPickerVisible(m.id); setEmojiPickerMsg(null); }} style={{ padding: 6 }}>
                                                    <Icon name="plus" size={16} color="#C9A84C" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {/* END HOVER MENUS */}
                                        {/* Reply bubble — clickable, gold left border */}
                                        {repliedMsg && (
                                            <TouchableOpacity style={styles.repliedBubble} activeOpacity={0.7} onPress={() => {
                                                // Scroll to the replied message
                                                const el = document.getElementById?.(`msg-${repliedMsg.id}`);
                                                if (el) {
                                                    el.style.transition = 'background-color 0.4s ease-out';
                                                    el.style.backgroundColor = 'rgba(201,168,76,0.3)';
                                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 2000);
                                                }
                                            }}>
                                                <View style={styles.repliedBubbleBar} />
                                                <View style={styles.repliedBubbleContent}>
                                                    <Text style={styles.repliedBubbleSender}>{repliedMsg.sender}</Text>
                                                    <Text style={styles.repliedBubbleText} numberOfLines={2}>{repliedMsg.text || 'Contenuto multimediale'}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}

                                        <View id={`msg-${m.id}`} style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                <Text style={[styles.msgSender, isMine && { color: '#C9A84C' }]}>{m.sender}</Text>
                                            </View>
                                            {m.text && !m.text.startsWith('📄') ? <Text style={styles.msgText}>{parseMarkdown(m.text)}</Text> : null}
                                            {m.voiceData && <VoiceMessageBubble src={m.voiceData} duration={m.voiceDuration} isMine={isMine} />}
                                            {m.poll && <PollMessage msg={m} user={user} onVote={(msgId, optIdx) => {
                                                if (isSelectMode) {
                                                    setSelectedMsgIds(p => p.includes(msgId) ? p.filter(id => id !== msgId) : [...p, msgId]);
                                                } else {
                                                    socket.emit('vote-poll', { channelId: activeChannel.id, messageId: msgId, optionIndex: optIdx });
                                                }
                                            }} />}
                                            {m.imageData && (
                                                m.text?.startsWith('📄') ? (
                                                    /* File attachment display */
                                                    <View style={styles.fileAttachment}>
                                                        <View style={styles.fileIconBox}>
                                                            <Icon name="file-text" size={24} color="#C9A84C" />
                                                        </View>
                                                        <Text style={styles.fileNameTxt} numberOfLines={1}>{m.text.replace('📄 ', '')}</Text>
                                                        <TouchableOpacity onPress={() => {
                                                            const a = document.createElement('a');
                                                            a.href = m.imageData;
                                                            a.download = m.text.replace('📄 ', '');
                                                            a.click();
                                                        }} style={styles.fileDownloadBtn}>
                                                            <Icon name="download" size={16} color="#C9A84C" />
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : (
                                                    /* Image/video display */
                                                    <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedImage(m.imageData)}>
                                                        <Image
                                                            source={{ uri: m.imageData }}
                                                            style={styles.msgImg}
                                                            resizeMode="cover"
                                                        />
                                                    </TouchableOpacity>
                                                )
                                            )}

                                            <View style={styles.msgMeta}>
                                                {m.pinned && <Icon name="pin" size={10} color="#C9A84C" />}
                                                {m.edited && <Text style={styles.msgEdited}>(modificato)</Text>}
                                                <Text style={styles.msgTime}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                                {isMine && (() => {
                                                    const totalOthers = (Array.isArray(onlineUsers) ? onlineUsers : []).filter(u => u.status === 'online' && u.username !== user.username).length;
                                                    const readCount = (m.readBy || []).length;
                                                    const delivered = (m.deliveredTo || []).length > 0;
                                                    if (readCount > 0 && readCount >= totalOthers && totalOthers > 0) {
                                                        // Read by all online users
                                                        return <Icon name="check-check" size={14} color="#C9A84C" />;
                                                    } else if (delivered) {
                                                        // Delivered but not all read
                                                        return <Icon name="check-check" size={14} color="#554E40" />;
                                                    } else {
                                                        // Just sent
                                                        return <Icon name="check" size={12} color="#554E40" />;
                                                    }
                                                })()}
                                            </View>
                                        </View>

                                        {/* Reactions */}
                                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                                            <View style={styles.reactionsWrap}>
                                                {Object.entries(m.reactions || {}).map(([emoji, usersArr]) => {
                                                    const isMyReaction = Array.isArray(usersArr) && usersArr.includes(user.username);
                                                    return (
                                                        <TouchableOpacity key={emoji} style={[styles.reactionBadge, isMyReaction && styles.reactionBadgeMy]} onPress={() => reactMessage(m.id, emoji)}>
                                                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                                                            <Text style={[styles.reactionCount, isMyReaction && { color: '#C9A84C' }]}>{(Array.isArray(usersArr) ? usersArr : []).length}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>

                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </LinearGradient>

                {/* ── Action Banner (Replying/Editing) ── */}
                <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.06)' }}>
                    {/* Replying / Editing banner */}
                    {(replyingTo || editingMsg) && (
                        <View style={styles.activeActionBanner}>
                            <Icon name="edit-2" size={14} color="#C9A84C" />
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
                                        <TouchableOpacity style={styles.plusItem} onPress={() => {
                                            setPlusVisible(false);
                                            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,video/*';
                                            inp.onchange = (e) => {
                                                const file = e.target.files[0]; if (!file) return;
                                                const reader = new FileReader(); reader.onload = () => {
                                                    socket.emit('channel-message', { channelId: activeChannel.id, imageData: reader.result, replyTo: replyingTo?.id });
                                                    setReplyingTo(null);
                                                }; reader.readAsDataURL(file);
                                            }; inp.click();
                                        }}>
                                            <Icon name="image" size={16} color="#C9A84C" /><Text style={styles.plusItemTxt}>Foto e video</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.plusItem} onPress={() => {
                                            setPlusVisible(false);
                                            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '*';
                                            inp.onchange = (e) => {
                                                const file = e.target.files[0]; if (!file) return;
                                                const reader = new FileReader(); reader.onload = () => {
                                                    socket.emit('channel-message', { channelId: activeChannel.id, text: `📄 ${file.name}`, imageData: reader.result, replyTo: replyingTo?.id });
                                                    setReplyingTo(null);
                                                }; reader.readAsDataURL(file);
                                            }; inp.click();
                                        }}>
                                            <Icon name="file-text" size={16} color="#C9A84C" /><Text style={styles.plusItemTxt}>Documento</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.plusItem} onPress={() => { setPlusVisible(false); setGifSearchVisible(true); }}>
                                            <Icon name="gift" size={16} color="#C9A84C" /><Text style={styles.plusItemTxt}>GIF</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                        {!isRecording && (
                            <TouchableOpacity style={{ padding: 8, marginRight: 2 }} onPress={() => setFullPickerVisible('INPUT')}>
                                <Icon name="smile" size={20} color="#888275" />
                            </TouchableOpacity>
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
            </View>
            }

            {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
            {!hideChatColumn && (
                <View style={{ position: 'relative', height: '100%', flexDirection: 'row' }}>
                    <Animated.View style={[
                        styles.column,
                        styles.rightPanel,
                        { width: 280, marginRight: rightAnim },
                        IS_MOBILE && { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 100, backgroundColor: '#141210' }
                    ]}>
                        <View style={{ width: 280, height: '100%', padding: 16, position: 'absolute', left: 0, top: 0 }}>
                            <View style={styles.rightHeader}>
                                <Text style={styles.rightHeaderTitle}>HUB GESTIONALE</Text>
                            </View>

                            <ScrollView style={{ flex: 1 }}>
                                {/* Pinned Messages Section — for everyone */}
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => setExpanded(p => ({ ...p, pinned: !p.pinned }))}>
                                    <Icon name="pin" size={15} color="#C9A84C" />
                                    <Text style={styles.hotelLbl}>MESSAGGI FISSATI</Text>
                                    <Icon name={expanded.pinned ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded.pinned && (() => {
                                    const channelPins = (pinned[activeChannel?.id] || []);
                                    const pinnedMsgs = (messages[activeChannel?.id] || []).filter(m => channelPins.includes(m.id));
                                    return (
                                        <View style={styles.savedList}>
                                            {pinnedMsgs.length === 0 && <Text style={styles.emptyArchiveTxt}>Nessun messaggio fissato in questo canale.</Text>}
                                            {pinnedMsgs.map((pm, idx) => (
                                                <TouchableOpacity key={idx} style={styles.archiveRow} onPress={() => {
                                                    const el = document.getElementById?.(`msg-${pm.id}`);
                                                    if (el) {
                                                        el.style.transition = 'background-color 0.4s ease-out';
                                                        el.style.backgroundColor = 'rgba(201,168,76,0.3)';
                                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 2000);
                                                    }
                                                }}>
                                                    <View style={styles.archiveIcon}><Icon name="pin" size={12} color="#C9A84C" /></View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.archiveTitle} numberOfLines={2}>{pm.text || '📷 Media'}</Text>
                                                        <Text style={styles.archiveDate}>{pm.sender}</Text>
                                                    </View>
                                                    <TouchableOpacity onPress={() => socket.emit('pin-message', { channelId: activeChannel.id, messageId: pm.id })} style={{ padding: 4 }}>
                                                        <Icon name="x" size={12} color="#554E40" />
                                                    </TouchableOpacity>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    );
                                })()}

                                {/* Saved Messages Section — personal */}
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => setExpanded(p => ({ ...p, saved: !p.saved }))}>
                                    <Icon name="bookmark" size={15} color="#C9A84C" />
                                    <Text style={styles.hotelLbl}>MESSAGGI SALVATI</Text>
                                    <Icon name={expanded.saved ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded.saved && (
                                    <View style={styles.savedList}>
                                        {savedChats.length === 0 && <Text style={styles.emptyArchiveTxt}>Nessun messaggio salvato. Tieni premuto su un messaggio e premi "Salva".</Text>}
                                        {savedChats.map((sc, idx) => (
                                            <TouchableOpacity key={idx} style={styles.archiveRow} onPress={() => {
                                                // Navigate to the message's channel and scroll to it
                                                const targetChannel = ALL_CHANNELS.find(ch => ch.id === sc.channelId) || activeChannel;
                                                setActiveChannel(targetChannel);
                                                setTimeout(() => {
                                                    const el = document.getElementById?.(`msg-${sc.id}`);
                                                    if (el) {
                                                        el.style.transition = 'background-color 0.4s ease-out';
                                                        el.style.backgroundColor = 'rgba(201,168,76,0.3)';
                                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 2000);
                                                    }
                                                }, 300);
                                            }}>
                                                <View style={styles.archiveIcon}><Icon name="bookmark" size={12} color="#C9A84C" /></View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.archiveTitle} numberOfLines={2}>{sc.text || '📷 Media'}</Text>
                                                    <Text style={styles.archiveDate}>{sc.sender} • {new Date(sc.timestamp).toLocaleDateString()}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => setSavedChats(s => s.filter((_, i) => i !== idx))} style={{ padding: 4 }}>
                                                    <Icon name="x" size={12} color="#554E40" />
                                                </TouchableOpacity>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                {/* Temp Chat Archive Section */}
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => {
                                    setExpanded(p => ({ ...p, voice: !p.voice }));
                                    if (!expanded.voice) socket.emit('get-voice-archives');
                                }}>
                                    <Icon name="archive" size={15} color="#C9A84C" />
                                    <Text style={styles.hotelLbl}>ARCHIVIO CHAT VOCALI</Text>
                                    <Icon name={expanded.voice ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>
                                {expanded.voice && (
                                    <View style={styles.savedList}>
                                        {roomArchives.length === 0 && <Text style={styles.emptyArchiveTxt}>Nessun archivio disponibile</Text>}
                                        {roomArchives.map((arc, idx) => (
                                            <TouchableOpacity key={idx} style={styles.archiveRow} onPress={() => setViewingArchive(arc)}>
                                                <View style={styles.archiveIcon}>
                                                    <Icon name="message-square" size={12} color="#C9A84C" />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.archiveTitle}>{arc.name || `Room #${arc.roomId}`}</Text>
                                                    <Text style={styles.archiveDate}>{new Date(arc.closedAt).toLocaleDateString()} {new Date(arc.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                {/* Team Section */}
                                <TouchableOpacity style={styles.navHotelRow} onPress={() => setExpanded(p => ({ ...p, users: !p.users }))}>
                                    <Icon name="users" size={15} color="#C9A84C" />
                                    <Text style={styles.hotelLbl}>TEAM — {(Array.isArray(onlineUsers) ? onlineUsers : []).length}</Text>
                                    <Icon name={expanded.users ? 'chevron-down' : 'chevron-right'} size={12} color="#554E40" />
                                </TouchableOpacity>

                                {expanded.users && (
                                    <View style={styles.userList}>
                                        {(Array.isArray(onlineUsers) ? [...onlineUsers] : []).sort((a, b) => {
                                            const statusOrder = { online: 0, idle: 1, dnd: 2, invisible: 3 };
                                            const aS = statusOrder[a?.status] ?? 99;
                                            const bS = statusOrder[b?.status] ?? 99;
                                            if (aS !== bS) return aS - bS;
                                            return (a?.username || '').localeCompare(b?.username || '');
                                        }).map((u, i) => (
                                            <TouchableOpacity key={i} style={styles.userRow} onPress={() => { setInfoModal(null); }}>
                                                <View style={styles.userAvatarSmall}>
                                                    {u?.profilePic
                                                        ? <Image source={{ uri: u.profilePic }} style={{ width: 24, height: 24, borderRadius: 6 }} />
                                                        : <Text style={styles.userAvatarTxtSmall}>{u?.username?.[0].toUpperCase()}</Text>}
                                                    <View style={[styles.onlineDotSmall, { backgroundColor: statusColor(u?.status) }]} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.userRowName, u?.status === 'invisible' && { color: '#444' }]}>{u?.username}</Text>
                                                    <Text style={styles.userRowStation}>{u?.station}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                    <View style={styles.hotelInfoBox}>
                                        <Text style={styles.hotelInfoTitle}>DIAGNOSTICA</Text>
                                        <TouchableOpacity style={styles.createBtn} onPress={() => onOpenDebug?.()}>
                                            <Icon name="activity" size={16} color="#111" />
                                            <Text style={styles.createBtnTxt}>TEST HANDSHAKE WebRTC</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.hotelInfoDesc}>Usa questo strumento per testare la connessione 1v1 se le chiamate normali non funzionano.</Text>
                                    </View>

                                    <View style={styles.hotelInfoBox}>
                                        <Text style={styles.hotelInfoTitle}>INFORMAZIONI HOTEL</Text>
                                        <Text style={styles.hotelInfoName}>{activeHotel ? activeHotel.name : 'Seleziona un hotel'}</Text>
                                        <Text style={styles.hotelInfoDesc}>{activeHotel ? activeHotel.desc : ''}</Text>
                                        {activeHotel && (
                                            <TouchableOpacity style={styles.contactRow}>
                                                <Icon name="phone" size={14} color="#C9A84C" />
                                                <Text style={styles.contactTxt}>{activeHotel.contact}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                            </ScrollView>
                        </View>
                    </Animated.View>

                    {/* Unified Rhombus Tab (Right) - Sibling and moving with rightAnim */}
                    <View style={[
                        styles.externalTab,
                        styles.rightExternalTab,
                        { right: '100%', position: 'absolute', marginRight: rightAnim }
                    ]}>
                        <TouchableOpacity
                            onPress={toggleRight}
                            activeOpacity={0.8}
                            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
                        >
                            <View style={{ transform: [{ rotate: rightRotate }] }}>
                                <Icon name="chevron-right" size={16} color="#C9A84C" />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* GIF Search Modal */}
            <Modal visible={gifSearchVisible} transparent animationType="fade" onRequestClose={() => setGifSearchVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGifSearchVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.fullEmojiBox, { height: '65%', width: 380 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Icon name="gift" size={16} color="#C9A84C" />
                                <Text style={[styles.infoTitle, { marginBottom: 0 }]}>Cerca GIF</Text>
                            </View>
                            <TouchableOpacity onPress={() => setGifSearchVisible(false)}>
                                <Icon name="x" size={16} color="#554E40" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#11100D', borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' }}>
                            <Icon name="search" size={14} color="#554E40" />
                            <TextInput
                                style={{ flex: 1, color: '#E8E4D8', fontSize: 14, paddingVertical: 10, paddingHorizontal: 8 }}
                                placeholder="Cerca una GIF..."
                                placeholderTextColor="#554E40"
                                value={gifSearch}
                                onChangeText={(text) => {
                                    setGifSearch(text);
                                    const apiKey = 'sQEgLD42pGfjWZfZ4uosoCrO6ngpVUwp';
                                    if (text.trim().length > 1) {
                                        fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(text)}&limit=20&rating=g`)
                                            .then(r => r.json())
                                            .then(data => setGifResults(data.data || []))
                                            .catch(() => setGifResults([]));
                                    } else if (text.trim().length === 0) {
                                        fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`)
                                            .then(r => r.json())
                                            .then(data => setGifResults(data.data || []))
                                            .catch(() => setGifResults([]));
                                    }
                                }}
                                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                            />
                        </View>
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {gifResults.map((gif, gi) => {
                                    const url = gif.images?.fixed_height?.url || gif.images?.original?.url;
                                    if (!url) return null;
                                    return (
                                        <TouchableOpacity key={gi} style={{ width: '48%', height: 120, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1A1812' }}
                                            onPress={() => {
                                                socket.emit('channel-message', { channelId: activeChannel.id, text: '', imageData: url, replyTo: replyingTo?.id });
                                                setReplyingTo(null);
                                                setGifSearchVisible(false);
                                                setGifSearch('');
                                                setGifResults([]);
                                            }}
                                        >
                                            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        </TouchableOpacity>
                                    );
                                })}
                                {gifResults.length === 0 && (
                                    <View style={{ width: '100%', paddingVertical: 40, alignItems: 'center' }}>
                                        <Icon name="search" size={32} color="#333" />
                                        <Text style={{ color: '#554E40', fontSize: 13, marginTop: 12 }}>
                                            {gifSearch ? 'Nessun risultato' : 'Digita per cercare GIF'}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                        <Text style={{ color: '#444', fontSize: 9, textAlign: 'right', marginTop: 6 }}>Powered by GIPHY</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* MODALS */}
            <Modal visible={!!fullPickerVisible} transparent animationType="fade" onRequestClose={() => setFullPickerVisible(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFullPickerVisible(null)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.fullEmojiBox, { height: '65%', width: 340 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Icon name="smile" size={16} color="#C9A84C" />
                            <Text style={[styles.infoTitle, { marginBottom: 0, marginLeft: 8 }]}>Reazioni</Text>
                        </View>
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            {GSA_EMOJI_DATA.map(cat => (
                                <View key={cat.name} style={{ marginBottom: 16 }}>
                                    <Text style={styles.emojiCategoryTitle}>{cat.name.toUpperCase()}</Text>
                                    <View style={styles.fullEmojiGrid}>
                                        {cat.emoji.map(emo => (
                                            <TouchableOpacity
                                                key={emo}
                                                style={styles.fullEmojiItem}
                                                onPress={() => {
                                                    if (fullPickerVisible === 'INPUT') {
                                                        setDraft(d => d + emo);
                                                    } else {
                                                        reactMessage(fullPickerVisible, emo);
                                                    }
                                                    setFullPickerVisible(null);
                                                }}
                                            >
                                                <Text style={{ fontSize: 24 }}>{emo}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
            {renderModals()}
            <UserProfileCard
                visible={profileVisible}
                onClose={() => setProfileVisible(false)}
                user={user}
                socket={socket}
                onLogout={onLogout}
            />
            <MediaSettings
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: 'transparent', ...NO_SELECT, position: 'relative' },
    column: { height: '100%' },

    // Message context menu & reactions
    msgHoverActions: { position: 'absolute', top: -10, flexDirection: 'row', gap: 4, backgroundColor: 'rgba(20,18,16,0.95)', borderRadius: 12, padding: 4, zIndex: 99999, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
    msgCaretBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
    signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginRight: 6 },
    signalBar: { width: 3, borderRadius: 1 },

    msgActionMenu: { position: 'absolute', top: 28, right: 0, backgroundColor: '#1C1A12', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 12, zIndex: 99999, width: 180, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20, overflow: 'hidden' },
    msgActionMenuLeft: { right: 'auto', left: 0 },
    msgActionMenuRight: { right: 0, left: 'auto' },

    msgEmojiPicker: { position: 'absolute', top: 28, flexDirection: 'row', backgroundColor: '#1C1A12', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 6, zIndex: 99999, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20 },
    msgEmojiPickerLeft: { left: 28 },
    msgEmojiPickerRight: { right: 28 },

    fullEmojiBox: { width: 320, maxHeight: 400, backgroundColor: '#1C1A12', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 16, padding: 16 },
    fullEmojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 },
    fullEmojiItem: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8 },
    emojiCategoryTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 4 },

    hoverEmojiBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
    hoverActionList: { padding: 4 },
    hoverActionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8 },
    hoverActionTxt: { color: '#E8E4D8', fontSize: 13, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    infoModalBox: { width: 300, backgroundColor: '#100E0C', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#C9A84C', gap: 8 },
    infoTitle: { color: '#C9A84C', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
    infoLabel: { color: '#A8A090', fontSize: 14, fontWeight: '600' },

    // Pinned Messages Banner
    pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(201,168,76,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.08)' },
    pinnedBannerTxt: { flex: 1, color: '#C9A84C', fontSize: 12, fontWeight: '700' },
    pinnedList: { backgroundColor: 'rgba(28,26,18,0.95)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)', maxHeight: 200, overflow: 'scroll' },
    pinnedItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.04)' },
    pinnedItemSender: { color: '#C9A84C', fontSize: 11, fontWeight: '800', width: 80 },
    pinnedItemText: { flex: 1, color: '#C8C4B8', fontSize: 12 },

    // Pull tabs (linguette)
    leftTrapezoid: { position: 'absolute', top: '50%', left: 0, width: 24, height: 60, marginTop: -30, backgroundColor: '#1C1A12', borderTopRightRadius: 8, borderBottomRightRadius: 8, justifyContent: 'center', alignItems: 'center', zIndex: 100, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
    rightTrapezoid: { position: 'absolute', top: '50%', right: 0, width: 24, height: 60, marginTop: -30, backgroundColor: '#1C1A12', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, justifyContent: 'center', alignItems: 'center', zIndex: 100, borderLeftWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },

    externalTab: {
        position: 'absolute',
        top: '40%',
        width: 22,
        height: 44,
        backgroundColor: '#141210',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0,
        zIndex: 999,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' } : {})
    },
    leftExternalTab: {
        position: 'absolute',
        top: '45%',
        borderTopRightRadius: 14,
        borderBottomRightRadius: 14,
        zIndex: 1000,
        width: 28,
        height: 60,
        backgroundColor: '#141210',
        borderWidth: 0,
        borderLeftWidth: 0
    },
    rightExternalTab: { position: 'absolute', top: '45%', borderTopLeftRadius: 14, borderBottomLeftRadius: 14, zIndex: 1000, width: 28, height: 60, backgroundColor: '#141210', borderWidth: 0 },
    collapseTabInternal: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    // Sidebar
    sidebar: { backgroundColor: 'rgba(20, 18, 16, 0.7)', borderRightColor: 'rgba(201,168,76,0.1)', zIndex: 10, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}) },
    sidebarHeader: { padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
    brandName: { color: '#C9A84C', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
    navHotelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingTop: 20 },
    hotelDot: { width: 8, height: 8, borderRadius: 4 },
    hotelLbl: { flex: 1, color: '#6E6960', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
    chRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
    chRowActive: { backgroundColor: 'rgba(201,168,76,0.08)' },
    chName: { color: '#6E6960', fontSize: 15, fontWeight: '600' },
    userFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginTop: 10 },
    avatarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2A2217', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    avatarTxt: { color: '#C9A84C', fontSize: 16, fontWeight: '800' },
    statusDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0B0A08' },
    userName: { color: '#C8C4B8', fontSize: 14, fontWeight: '700' },
    userStat: { color: '#554E40', fontSize: 11 },
    gearBtn: { padding: 8 },

    roomBadge: { backgroundColor: 'rgba(201,168,76,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
    roomBadgeTxt: { color: '#C9A84C', fontSize: 10, fontWeight: '900' },
    roomUserAvatars: { flexDirection: 'row', paddingLeft: 34, gap: -8, paddingBottom: 10 },
    miniAvatarContainer: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#141210', overflow: 'hidden' },
    miniAvatar: { width: '100%', height: '100%' },
    miniAvatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#2A2217', justifyContent: 'center', alignItems: 'center' },
    miniAvatarTxt: { color: '#C9A84C', fontSize: 8, fontWeight: '900' },

    // Chat
    chatCol: { flex: 1, backgroundColor: 'rgba(20, 18, 16, 0.2)' },
    chatHeader: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)', backgroundColor: 'rgba(20, 18, 14, 0.7)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) },
    headerChName: { color: '#C8C4B8', fontSize: 18, fontWeight: '800', marginLeft: 8 },
    pdfBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', marginRight: 16, gap: 6 },
    pdfBtnTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    statusBadgeDot: { width: 8, height: 8, borderRadius: 4 },
    statusBadgeTxt: { color: '#C8C4B8', fontSize: 12, fontWeight: '600' },

    reactionSideBtn: { position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(28, 26, 20, 0.9)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)', zIndex: 100 },
    bubbleCaretWrap: { position: 'absolute', top: 0, right: 0, borderTopRightRadius: 12, overflow: 'hidden', zIndex: 20 },
    bubbleCaretGradient: { position: 'absolute', top: 0, right: 0, width: 40, height: 40 },
    bubbleCaret: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },

    messagesScroll: { flex: 1 },
    msgRow: { flexDirection: 'row', marginBottom: 6, width: '100%', position: 'relative', paddingHorizontal: 16 },
    msgRowMine: { flexDirection: 'row-reverse' },
    bubbleWrap: { maxWidth: '85%', minWidth: 100, position: 'relative' },
    bubble: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    bubbleOther: { backgroundColor: '#1C1A16', borderTopLeftRadius: 2 },
    bubbleMine: { backgroundColor: '#28241C', borderTopRightRadius: 2 },
    msgSender: { color: '#C9A84C', fontSize: 12, fontWeight: '800', marginBottom: 1 },
    msgText: { color: '#E8E4D8', fontSize: 16, lineHeight: 22 },
    msgTime: { color: '#6E6960', fontSize: 10, fontWeight: '600' },
    msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    msgEdited: { color: '#554E40', fontSize: 10, fontStyle: 'italic', marginRight: 4 },
    msgChevron: { position: 'absolute', top: 4, right: 4, zIndex: 10, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16 },
    msgImg: { width: 280, minHeight: 120, maxHeight: 400, borderRadius: 12, marginTop: 6, backgroundColor: '#1A1812' },
    fileAttachment: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#11100D', borderRadius: 12, padding: 12, marginTop: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    fileIconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(201,168,76,0.1)', justifyContent: 'center', alignItems: 'center' },
    fileNameTxt: { flex: 1, color: '#C8C4B8', fontSize: 13, fontWeight: '600' },
    fileDownloadBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(201,168,76,0.1)', justifyContent: 'center', alignItems: 'center' },

    repliedBubble: { flexDirection: 'row', marginBottom: 6, borderRadius: 8, backgroundColor: 'rgba(201,168,76,0.06)', overflow: 'hidden' },
    repliedBubbleBar: { width: 3, backgroundColor: '#C9A84C' },
    repliedBubbleContent: { padding: 8, flex: 1 },
    repliedBubbleSender: { color: '#C9A84C', fontSize: 12, fontWeight: '800', marginBottom: 2 },
    repliedBubbleText: { color: '#A8A090', fontSize: 12, fontStyle: 'italic' },
    reactionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    reactionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
    reactionBadgeMy: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.3)' },
    reactionEmoji: { fontSize: 12 },
    reactionCount: { color: '#6E6960', fontSize: 11, fontWeight: '700' },

    activeActionBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(201,168,76,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
    activeActionTxt: { flex: 1, color: '#C8C4B8', fontSize: 13, fontStyle: 'italic' },

    inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: 'rgba(20, 18, 14, 0.6)', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.1)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) },
    input: { flex: 1, backgroundColor: '#1C1A12', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, color: '#C8C4B8', fontSize: 16, maxHeight: SCREEN_H * 0.15 },
    plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    plusMenu: { position: 'absolute', bottom: 50, left: 0, width: 200, backgroundColor: '#1A1812', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', zIndex: 1000 },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8 },
    plusItemTxt: { color: '#C8C4B8', fontSize: 15, fontWeight: '600' },
    sendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    sendBtnActive: { backgroundColor: '#C9A84C' },

    // Right Panel
    rightPanel: { backgroundColor: 'rgba(20, 18, 16, 0.7)', borderLeftColor: 'rgba(201,168,76,0.1)', zIndex: 10, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}) },
    rightHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    rightHeaderTitle: { color: '#C9A84C', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
    savedList: { paddingLeft: 12, paddingVertical: 10 },
    emptyArchiveTxt: { color: '#444', fontSize: 11, fontStyle: 'italic' },
    archiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.05)' },
    archiveIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(201,168,76,0.08)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    archiveTitle: { color: '#C8C4B8', fontSize: 12, fontWeight: '600', lineHeight: 18 },
    archiveDate: { color: '#554E40', fontSize: 10, marginTop: 2 },
    userList: { paddingLeft: 10 },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    userAvatarSmall: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#1A1812', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    userAvatarTxtSmall: { color: '#C9A84C', fontSize: 10, fontWeight: '900' },
    userRowName: { color: '#C8C4B8', fontSize: 14, fontWeight: '700' },
    userRowStation: { color: '#554E40', fontSize: 10 },
    onlineDotSmall: { position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#141210' },

    hotelInfoBox: { marginTop: 20, padding: 16, backgroundColor: 'rgba(201,168,76,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    hotelInfoTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
    hotelDotLarge: { width: 40, height: 40, borderRadius: 10, marginBottom: 12 },
    hotelInfoName: { color: '#C8C4B8', fontSize: 16, fontWeight: '800', marginBottom: 4 },
    hotelInfoDesc: { color: '#6E6960', fontSize: 13, lineHeight: 20, marginBottom: 16 },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    contactTxt: { color: '#C9A84C', fontSize: 14, fontWeight: '600' },

    // Poll
    waPoll: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14, gap: 8, marginTop: 6, minWidth: 260 },
    waPollTitle: { color: '#C8C4B8', fontSize: 17, fontWeight: '700' },
    waPollSub: { color: '#554E40', fontSize: 11, fontWeight: '600' },
    waPollTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
    waPollTypeBadgeMultiple: { backgroundColor: 'rgba(201,168,76,0.14)', borderColor: 'rgba(201,168,76,0.3)' },
    waPollTypeIcon: { fontSize: 12 },
    waPollTypeTxt: { color: '#C9A84C', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    waPollOpt: { position: 'relative', height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
    waPollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(201,168,76,0.15)' },
    waPollContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
    waPollCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#554E40', justifyContent: 'center', alignItems: 'center' },
    waPollCheckInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A84C' },
    waPollText: { flex: 1, color: '#A8A090', fontSize: 15, fontWeight: '600' },
    waPollCount: { color: '#C9A84C', fontSize: 14, fontWeight: '700' },
    waPollFooter: { color: '#3A3630', fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },

    // Placeholder
    emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    emptyChatIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(201,168,76,0.06)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    emptyChatTitle: { color: '#C9A84C', fontSize: 17, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    emptyChatSub: { color: '#554E40', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
    selectHeaderBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#1C1A12', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50
    },
    selectCountTxt: { color: '#E8E4D8', fontSize: 13, fontWeight: '700' },
    selectActionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#C9A84C', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16
    },
    selectActionBtnTxt: { color: '#111', fontSize: 12, fontWeight: '800' },
    // Utility
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#C9A84C',
        paddingVertical: 12,
        borderRadius: 10,
        gap: 10,
        marginBottom: 16,
        shadowColor: '#C9A84C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    createBtnTxt: { color: '#111', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
    mdCode: { fontFamily: 'monospace', backgroundColor: '#11100D', padding: 8, borderRadius: 6, color: '#C9A84C', marginVertical: 4 },
    mdInlineCode: { fontFamily: 'monospace', backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, color: '#C9A84C', fontSize: 14 },
    mdBold: { fontWeight: 'bold', color: '#E8E4D8' },
    mdItalic: { fontStyle: 'italic' },
    mdStrike: { textDecorationLine: 'line-through', color: '#6E6960' },
    mdH1: { fontSize: 22, fontWeight: '900', color: '#E8E4D8', marginVertical: 4 },
    mdH2: { fontSize: 19, fontWeight: '800', color: '#E8E4D8', marginVertical: 3 },
    mdH3: { fontSize: 17, fontWeight: '700', color: '#E8E4D8', marginVertical: 2 },
    mdH4: { fontSize: 15, fontWeight: '700', color: '#C8C4B8', marginVertical: 2 },
    mdBlockquote: { color: '#A8A090', fontStyle: 'italic', borderLeftWidth: 3, borderLeftColor: '#C9A84C', paddingLeft: 10, marginVertical: 4 },
    mdListItem: { color: '#C8C4B8', fontSize: 15, lineHeight: 22, paddingLeft: 4 },

    forwardItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.05)' },
    forwardItemTxt: { color: '#C8C4B8', fontSize: 15, fontWeight: '600' },
});
