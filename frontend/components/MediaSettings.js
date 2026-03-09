/**
 * MediaSettings.js — v2.2.0
 * Profile-only settings modal.
 * - Editable username, bio
 * - Profile picture upload (base64)
 * - Server connection status + ping
 * - No "Dispositivi" tab
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Modal, StyleSheet, TouchableOpacity,
    Dimensions, Platform, ScrollView, TextInput, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';

const { height } = Dimensions.get('window');
const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'http://192.168.1.46:3000';

export default function MediaSettings({ visible, onClose, user }) {
    const [ping, setPing] = useState(null);
    const [connStatus, setConnStatus] = useState('Misurazione...');
    const pingInterval = useRef(null);

    // Editable fields
    const [editUsername, setEditUsername] = useState(user?.username || '');
    const [editBio, setEditBio] = useState(user?.bio || '');
    const [profilePic, setProfilePic] = useState(user?.profilePic || null);
    const [saved, setSaved] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (visible) {
            setEditUsername(user?.username || '');
            setEditBio(user?.bio || '');
            setProfilePic(user?.profilePic || null);
            setSaved(false);
            startPing();
        } else {
            if (pingInterval.current) clearInterval(pingInterval.current);
        }
        return () => {
            if (pingInterval.current) clearInterval(pingInterval.current);
        };
    }, [visible]);

    const startPing = () => {
        const measure = async () => {
            try {
                const t = Date.now();
                await fetch(`${SIGNALING_URL}/ping`, { cache: 'no-store' });
                const ms = Date.now() - t;
                setPing(ms);
                setConnStatus(ms < 100 ? 'Eccellente' : ms < 250 ? 'Buono' : 'Lento');
            } catch {
                setPing(null);
                setConnStatus('Disconnesso');
            }
        };
        measure();
        pingInterval.current = setInterval(measure, 5000);
    };

    const handleSave = () => {
        // Update the user object in-place (in a real app, this would call an API)
        if (user) {
            user.username = editUsername;
            user.bio = editBio;
            user.profilePic = profilePic;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handlePickPhoto = () => {
        if (Platform.OS === 'web') {
            // Create hidden file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setProfilePic(ev.target.result);
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        }
    };

    const pingColor = connStatus === 'Eccellente' ? '#23A559'
        : connStatus === 'Buono' ? '#FEE75C'
            : connStatus === 'Lento' ? '#F0B232'
                : '#ED4245';

    const initials = editUsername ? editUsername.charAt(0).toUpperCase() : '?';

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <View style={styles.modalWrapper}>
                    {/* Sidebar */}
                    <View style={styles.sidebar}>
                        <Text style={styles.sidebarCategory}>ACCOUNT</Text>
                        <View style={styles.sidebarItemActive}>
                            <Icon name="user" size={15} color="#D4AF37" />
                            <Text style={styles.sidebarItemTextActive}>Profilo</Text>
                        </View>
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                        {/* Header */}
                        <View style={styles.contentHeader}>
                            <Text style={styles.contentTitle}>Il tuo Profilo</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Icon name="x" size={18} color="#B5BAC1" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>

                            {/* Profile Banner + Avatar */}
                            <View style={styles.bannerArea}>
                                <LinearGradient colors={['#1a1040', '#0f2040', '#1a0f30']} style={styles.banner} />
                                <TouchableOpacity onPress={handlePickPhoto} style={styles.avatarWrapper} activeOpacity={0.8}>
                                    {profilePic ? (
                                        <Image source={{ uri: profilePic }} style={styles.avatarImg} />
                                    ) : (
                                        <LinearGradient colors={['#D4AF37', '#7A6520']} style={styles.avatarGradient}>
                                            <Text style={styles.avatarInitial}>{initials}</Text>
                                        </LinearGradient>
                                    )}
                                    <View style={styles.avatarEditBadge}>
                                        <Icon name="camera" size={11} color="#FFF" />
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Editable card */}
                            <View style={styles.profileCard}>
                                <View style={styles.fieldRow}>
                                    <Text style={styles.fieldLabel}>NOME UTENTE</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={editUsername}
                                        onChangeText={setEditUsername}
                                        placeholderTextColor="rgba(255,255,255,0.25)"
                                        maxLength={32}
                                    />
                                </View>

                                <View style={styles.fieldDivider} />

                                <View style={styles.fieldRow}>
                                    <Text style={styles.fieldLabel}>BIO</Text>
                                    <TextInput
                                        style={[styles.fieldInput, styles.fieldInputMultiline]}
                                        value={editBio}
                                        onChangeText={setEditBio}
                                        placeholder="Scrivi qualcosa su di te..."
                                        placeholderTextColor="rgba(255,255,255,0.25)"
                                        multiline
                                        numberOfLines={3}
                                        maxLength={190}
                                    />
                                    <Text style={styles.charCount}>{editBio.length}/190</Text>
                                </View>
                            </View>

                            {/* Connection info */}
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>CONNESSIONE</Text>
                            </View>
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoKey}>Stato</Text>
                                    <View style={styles.infoValueRow}>
                                        <View style={[styles.statusDot, { backgroundColor: pingColor }]} />
                                        <Text style={[styles.infoValue, { color: pingColor }]}>{connStatus}</Text>
                                    </View>
                                </View>
                                <View style={[styles.infoRow, styles.infoRowLast]}>
                                    <Text style={styles.infoKey}>Ping</Text>
                                    <Text style={[styles.infoValue, { color: pingColor }]}>
                                        {ping !== null ? `${ping} ms` : '— ms'}
                                    </Text>
                                </View>
                            </View>

                            {/* Save button */}
                            <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnSuccess]} onPress={handleSave} activeOpacity={0.85}>
                                <Text style={styles.saveBtnText}>{saved ? '✓ Salvato!' : 'Salva Modifiche'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.closeLink} onPress={onClose}>
                                <Text style={styles.closeLinkText}>Chiudi</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalWrapper: {
        width: Platform.OS === 'web' && Dimensions.get('window').width >= 600 ? '90%' : '100%',
        maxWidth: 780,
        height: Platform.OS === 'web' && Dimensions.get('window').height >= 500 ? '85%' : '100%',
        maxHeight: 620,
        flexDirection: 'row', borderRadius: Platform.OS === 'web' && Dimensions.get('window').width >= 600 ? 8 : 0,
        overflow: 'hidden',
        backgroundColor: '#313338',
        shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.9, shadowRadius: 40,
    },

    // Sidebar
    sidebar: { width: 220, backgroundColor: '#2B2D31', paddingTop: 24, paddingHorizontal: 10 },
    sidebarCategory: { color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 2, fontWeight: '700', paddingHorizontal: 10, marginBottom: 2, marginTop: 4 },
    sidebarItemActive: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 6, backgroundColor: 'rgba(212,175,55,0.12)' },
    sidebarItemTextActive: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },

    // Content
    content: { flex: 1, backgroundColor: '#313338' },
    contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    contentTitle: { color: '#DCDDDE', fontSize: 18, fontWeight: '700' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },

    scrollArea: { flex: 1, paddingHorizontal: 24 },

    // Banner & Avatar
    bannerArea: { marginTop: 20, marginBottom: 60, position: 'relative' },
    banner: { height: 100, borderRadius: 8 },
    avatarWrapper: { position: 'absolute', bottom: -40, left: 16 },
    avatarImg: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: '#313338' },
    avatarGradient: { width: 82, height: 82, borderRadius: 41, justifyContent: 'center', alignItems: 'center', borderWidth: 5, borderColor: '#313338' },
    avatarInitial: { color: '#000', fontSize: 34, fontWeight: '800' },
    avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#5865F2', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#313338' },

    // Profile card
    profileCard: { backgroundColor: '#2B2D31', borderRadius: 8, padding: 16, marginBottom: 20 },
    fieldRow: { paddingVertical: 8 },
    fieldLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
    fieldInput: {
        backgroundColor: '#1E1F22', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10,
        color: '#DCDDDE', fontSize: 14,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    fieldInputMultiline: { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
    charCount: { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'right', marginTop: 6 },
    fieldDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 10 },

    // Section header
    sectionHeader: { marginBottom: 10 },
    sectionTitle: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700' },

    // Info card
    infoCard: { backgroundColor: '#2B2D31', borderRadius: 8, overflow: 'hidden', marginBottom: 24 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    infoRowLast: { borderBottomWidth: 0 },
    infoKey: { color: '#B5BAC1', fontSize: 14 },
    infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    infoValue: { fontSize: 14, fontWeight: '600' },

    // Save
    saveBtn: { backgroundColor: '#5865F2', paddingVertical: 13, borderRadius: 6, alignItems: 'center', marginBottom: 12 },
    saveBtnSuccess: { backgroundColor: '#23A559' },
    saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
    closeLink: { alignItems: 'center', paddingVertical: 16, marginBottom: 8 },
    closeLinkText: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },
});
