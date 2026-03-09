/**
 * MediaSettings.js — v2.4.0
 * Two-tab settings modal:
 * - "Profilo": editable username, bio, profile picture, server ping
 * - "Dispositivi": mic/speaker/camera selectors that sync to CallScreen via
 *    a gsa-device-change window event (one-way: settings → call, NOT vice-versa)
 * Gold/black hotel theme. Non-selectable UI text.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Modal, StyleSheet, TouchableOpacity,
    Dimensions, Platform, ScrollView, TextInput, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';

const { height, width: W } = Dimensions.get('window');
const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';
const NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none' } : {};

const loadSavedDevices = () => { try { return JSON.parse(localStorage.getItem('gsa_devices') || '{}'); } catch { return {}; } };
const saveDev = (d) => { try { localStorage.setItem('gsa_devices', JSON.stringify(d)); } catch { } };
const emitDevChange = (d) => { if (Platform.OS === 'web') window.dispatchEvent(new CustomEvent('gsa-device-change', { detail: d })); };

export default function MediaSettings({ visible, onClose, user }) {
    const [tab, setTab] = useState('profilo');
    const [ping, setPing] = useState(null);
    const [connStatus, setConnStatus] = useState('Misurazione...');
    const pingRef = useRef(null);

    // Profile
    const [editUsername, setEditUsername] = useState(user?.username || '');
    const [editBio, setEditBio] = useState(user?.bio || '');
    const [profilePic, setProfilePic] = useState(user?.profilePic || null);
    const [saved, setSaved] = useState(false);

    // Devices
    const [audioInputs, setAudioInputs] = useState([]);
    const [audioOutputs, setAudioOutputs] = useState([]);
    const [videoInputs, setVideoInputs] = useState([]);
    const [selAudioIn, setSelAudioIn] = useState('');
    const [selAudioOut, setSelAudioOut] = useState('');
    const [selVideo, setSelVideo] = useState('');

    useEffect(() => {
        if (visible) {
            setEditUsername(user?.username || '');
            setEditBio(user?.bio || '');
            setProfilePic(user?.profilePic || null);
            setSaved(false);
            startPing();
            if (Platform.OS === 'web') loadDeviceList();
            const saved = loadSavedDevices();
            if (saved.audioIn) setSelAudioIn(saved.audioIn);
            if (saved.audioOut) setSelAudioOut(saved.audioOut);
            if (saved.video) setSelVideo(saved.video);
        } else {
            if (pingRef.current) clearInterval(pingRef.current);
        }
        return () => { if (pingRef.current) clearInterval(pingRef.current); };
    }, [visible]);

    const startPing = () => {
        const measure = async () => {
            try {
                const t = Date.now();
                await fetch(`${SIGNALING_URL}/ping`, { cache: 'no-store' });
                const ms = Date.now() - t;
                setPing(ms);
                setConnStatus(ms < 100 ? 'Eccellente' : ms < 250 ? 'Buono' : 'Lento');
            } catch { setPing(null); setConnStatus('Disconnesso'); }
        };
        measure();
        pingRef.current = setInterval(measure, 5000);
    };

    const loadDeviceList = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => { });
            const all = await navigator.mediaDevices.enumerateDevices();
            setAudioInputs(all.filter(d => d.kind === 'audioinput'));
            setAudioOutputs(all.filter(d => d.kind === 'audiooutput'));
            setVideoInputs(all.filter(d => d.kind === 'videoinput'));
        } catch (_) { }
    };

    const applyDevice = (type, deviceId) => {
        const newDev = { audioIn: selAudioIn, audioOut: selAudioOut, video: selVideo, [type]: deviceId };
        if (type === 'audioIn') { setSelAudioIn(deviceId); newDev.audioIn = deviceId; }
        if (type === 'audioOut') { setSelAudioOut(deviceId); newDev.audioOut = deviceId; }
        if (type === 'video') { setSelVideo(deviceId); newDev.video = deviceId; }
        saveDev({ audioIn: newDev.audioIn, audioOut: newDev.audioOut, video: newDev.video });
        emitDevChange({ audioIn: newDev.audioIn, audioOut: newDev.audioOut, video: newDev.video });
    };

    const handleSave = () => {
        if (user) { user.username = editUsername; user.bio = editBio; user.profilePic = profilePic; }
        setSaved(true); setTimeout(() => setSaved(false), 2000);
    };

    const handlePickPhoto = () => {
        if (Platform.OS !== 'web') return;
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setProfilePic(ev.target.result); r.readAsDataURL(f); };
        inp.click();
    };

    const pingColor = connStatus === 'Eccellente' ? '#23A559' : connStatus === 'Buono' ? '#C9A84C' : connStatus === 'Lento' ? '#F0B232' : '#ED4245';
    const initials = editUsername ? editUsername.charAt(0).toUpperCase() : '?';
    const devLabel = (d) => d?.label?.replace(/\(.*?\)/g, '').trim() || d?.deviceId?.slice(0, 14) || '—';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} onPress={() => { }}
                    style={[styles.modalWrapper, Platform.OS === 'web' && W >= 600 ? {} : { width: '100%', height: '100%', borderRadius: 0 }]}>

                    {/* Sidebar nav */}
                    <LinearGradient colors={['#1C1A12', '#12100E']} style={styles.sidebar}>
                        <Text style={[styles.sideTitle, NO_SELECT]}>IMPOSTAZIONI</Text>

                        <TouchableOpacity style={[styles.navItem, tab === 'profilo' && styles.navItemActive]} onPress={() => setTab('profilo')}>
                            <Icon name="user" size={17} color={tab === 'profilo' ? '#C9A84C' : '#6E6960'} />
                            <Text style={[styles.navLabel, tab === 'profilo' && { color: '#C9A84C' }, NO_SELECT]}>Profilo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.navItem, tab === 'dispositivi' && styles.navItemActive]} onPress={() => setTab('dispositivi')}>
                            <Icon name="settings" size={17} color={tab === 'dispositivi' ? '#C9A84C' : '#6E6960'} />
                            <Text style={[styles.navLabel, tab === 'dispositivi' && { color: '#C9A84C' }, NO_SELECT]}>Dispositivi</Text>
                        </TouchableOpacity>

                        {/* Connection status at bottom of sidebar */}
                        <View style={styles.sideBottom}>
                            <View style={[styles.pingDot, { backgroundColor: pingColor }]} />
                            <Text style={[styles.pingLabel, NO_SELECT]}>{connStatus}</Text>
                            {ping !== null && <Text style={[styles.pingMs, NO_SELECT]}>{ping}ms</Text>}
                        </View>
                    </LinearGradient>

                    {/* Content */}
                    <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>

                        {/* Close */}
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Icon name="x" size={18} color="#6E6960" />
                        </TouchableOpacity>

                        {/* ── PROFILO TAB ── */}
                        {tab === 'profilo' && (
                            <View>
                                <Text style={[styles.sectionTitle, NO_SELECT]}>Il tuo profilo</Text>

                                {/* Avatar */}
                                <View style={styles.avatarRow}>
                                    <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto}>
                                        {profilePic
                                            ? <Image source={{ uri: profilePic }} style={styles.avatar} />
                                            : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                                <Text style={styles.avatarInitial}>{initials}</Text>
                                            </View>
                                        }
                                        <View style={styles.avatarEdit}><Icon name="camera" size={14} color="#111" /></View>
                                    </TouchableOpacity>
                                    <View style={styles.avatarInfo}>
                                        <Text style={[styles.fieldLabel, NO_SELECT]}>FOTO PROFILO</Text>
                                        <Text style={[styles.avatarHint, NO_SELECT]}>Clicca sull'avatar per cambiare la foto</Text>
                                        <Text style={[styles.stationBadge, NO_SELECT]}>{user?.station || 'Receptionist'}</Text>
                                    </View>
                                </View>

                                {/* Username */}
                                <Text style={[styles.fieldLabel, NO_SELECT]}>NOME UTENTE</Text>
                                <TextInput style={[styles.field, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                                    value={editUsername} onChangeText={setEditUsername} placeholderTextColor="#554E40" />

                                {/* Bio */}
                                <Text style={[styles.fieldLabel, NO_SELECT]}>BIO</Text>
                                <TextInput style={[styles.field, styles.fieldMulti, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                                    value={editBio} onChangeText={setEditBio}
                                    placeholder="Scrivi qualcosa su di te..." placeholderTextColor="#554E40" multiline numberOfLines={3} />

                                {/* Connection info */}
                                <View style={styles.connRow}>
                                    <Text style={[styles.fieldLabel, NO_SELECT]}>CONNESSIONE SERVER</Text>
                                    <View style={styles.connDetail}>
                                        <View style={[styles.pingDot, { backgroundColor: pingColor }]} />
                                        <Text style={[styles.connStatus, NO_SELECT]}>{connStatus}</Text>
                                        {ping !== null && <Text style={[styles.connPing, NO_SELECT]}>{ping} ms</Text>}
                                    </View>
                                </View>

                                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                    <Text style={[styles.saveBtnTxt, NO_SELECT]}>{saved ? '✓ Salvato!' : 'Salva modifiche'}</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ── DISPOSITIVI TAB ── */}
                        {tab === 'dispositivi' && (
                            <View style={{ gap: 22 }}>
                                <Text style={[styles.sectionTitle, NO_SELECT]}>Dispositivi audio e video</Text>
                                <Text style={[styles.devNote, NO_SELECT]}>
                                    Seleziona i dispositivi predefiniti. Il cambiamento è applicato immediatamente alla chiamata in corso.
                                </Text>

                                {/* Microphone */}
                                <View>
                                    <View style={styles.devHeader}>
                                        <Icon name="mic" size={15} color="#C9A84C" />
                                        <Text style={[styles.devLabel, NO_SELECT]}>MICROFONO</Text>
                                    </View>
                                    {audioInputs.length === 0 && <Text style={[styles.devEmpty, NO_SELECT]}>Nessun microfono trovato</Text>}
                                    {audioInputs.map(d => (
                                        <TouchableOpacity key={d.deviceId} style={[styles.devOption, selAudioIn === d.deviceId && styles.devOptionActive]}
                                            onPress={() => applyDevice('audioIn', d.deviceId)}>
                                            <Text style={[styles.devOptionTxt, selAudioIn === d.deviceId && { color: '#C9A84C' }, NO_SELECT]} numberOfLines={1}>{devLabel(d)}</Text>
                                            {selAudioIn === d.deviceId && <Icon name="check" size={14} color="#C9A84C" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Speaker */}
                                <View>
                                    <View style={styles.devHeader}>
                                        <Icon name="volume-2" size={15} color="#C9A84C" />
                                        <Text style={[styles.devLabel, NO_SELECT]}>ALTOPARLANTE</Text>
                                    </View>
                                    {audioOutputs.length === 0 && <Text style={[styles.devEmpty, NO_SELECT]}>Nessun altoparlante trovato</Text>}
                                    {audioOutputs.map(d => (
                                        <TouchableOpacity key={d.deviceId} style={[styles.devOption, selAudioOut === d.deviceId && styles.devOptionActive]}
                                            onPress={() => applyDevice('audioOut', d.deviceId)}>
                                            <Text style={[styles.devOptionTxt, selAudioOut === d.deviceId && { color: '#C9A84C' }, NO_SELECT]} numberOfLines={1}>{devLabel(d)}</Text>
                                            {selAudioOut === d.deviceId && <Icon name="check" size={14} color="#C9A84C" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Camera */}
                                <View>
                                    <View style={styles.devHeader}>
                                        <Icon name="camera" size={15} color="#C9A84C" />
                                        <Text style={[styles.devLabel, NO_SELECT]}>FOTOCAMERA</Text>
                                    </View>
                                    {videoInputs.length === 0 && <Text style={[styles.devEmpty, NO_SELECT]}>Nessuna fotocamera trovata</Text>}
                                    {videoInputs.map(d => (
                                        <TouchableOpacity key={d.deviceId} style={[styles.devOption, selVideo === d.deviceId && styles.devOptionActive]}
                                            onPress={() => applyDevice('video', d.deviceId)}>
                                            <Text style={[styles.devOptionTxt, selVideo === d.deviceId && { color: '#C9A84C' }, NO_SELECT]} numberOfLines={1}>{devLabel(d)}</Text>
                                            {selVideo === d.deviceId && <Icon name="check" size={14} color="#C9A84C" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalWrapper: {
        width: '88%', maxWidth: 760,
        height: Platform.OS === 'web' && Dimensions.get('window').height >= 500 ? '82%' : '100%',
        maxHeight: 600, flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
        backgroundColor: '#1A1812',
        shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.9, shadowRadius: 40,
    },
    sidebar: { width: 200, padding: 20, gap: 4, justifyContent: 'flex-start' },
    sideTitle: { color: '#554E40', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 14 },
    navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 6 },
    navItemActive: { backgroundColor: 'rgba(201,168,76,0.1)' },
    navLabel: { color: '#6E6960', fontSize: 15, fontWeight: '500' },
    sideBottom: { marginTop: 'auto', gap: 4, paddingTop: 20 },
    pingDot: { width: 8, height: 8, borderRadius: 4 },
    pingLabel: { color: '#6E6960', fontSize: 12 },
    pingMs: { color: '#554E40', fontSize: 11 },

    content: { flex: 1, backgroundColor: '#16140F' },
    contentPad: { padding: 28, paddingTop: 46 },
    closeBtn: { position: 'absolute', top: 14, right: 14, padding: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
    sectionTitle: { color: '#C8C4B8', fontSize: 20, fontWeight: '800', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.08)', paddingBottom: 14 },

    // Profile
    avatarRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-start', marginBottom: 20 },
    avatarWrap: { position: 'relative' },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#C9A84C' },
    avatarPlaceholder: { backgroundColor: '#2A2217', justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { color: '#C9A84C', fontSize: 32, fontWeight: '800' },
    avatarEdit: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#C9A84C', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
    avatarInfo: { flex: 1, gap: 5, justifyContent: 'center' },
    avatarHint: { color: '#554E40', fontSize: 12 },
    stationBadge: { backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, color: '#C9A84C', fontSize: 12, fontWeight: '700', alignSelf: 'flex-start' },
    fieldLabel: { color: '#6E6960', fontSize: 11, letterSpacing: 1.5, fontWeight: '700', marginBottom: 6, marginTop: 14 },
    field: { backgroundColor: '#0E0D0C', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 11, color: '#C8C4B8', fontSize: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    fieldMulti: { minHeight: 80, textAlignVertical: 'top' },
    connRow: { marginTop: 16 },
    connDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    connStatus: { color: '#C8C4B8', fontSize: 14 },
    connPing: { color: '#6E6960', fontSize: 13 },
    saveBtn: { backgroundColor: '#C9A84C', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
    saveBtnTxt: { color: '#111', fontWeight: '800', fontSize: 15 },

    // Devices
    devNote: { color: '#6E6960', fontSize: 13, lineHeight: 20, marginTop: -10 },
    devHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    devLabel: { color: '#6E6960', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
    devEmpty: { color: '#3A3630', fontSize: 13, fontStyle: 'italic', marginLeft: 4 },
    devOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 4, borderWidth: 1, borderColor: 'transparent' },
    devOptionActive: { backgroundColor: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.2)' },
    devOptionTxt: { color: '#A8A090', fontSize: 14, flex: 1, marginRight: 10 },
});
