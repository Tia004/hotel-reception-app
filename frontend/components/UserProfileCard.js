/**
 * UserProfileCard.js — v2.5.0
 * Popover for user profile:
 * - Edit username, bio, profile picture (synced with settings).
 * - Discord-style status selector: current status row with arrow -> submenu to the right.
 * - Logout button at the bottom.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, Image } from 'react-native';
import { Icon } from './Icons';

const STATUS_LIST = [
    { id: 'online', label: 'Online', color: '#23A559', desc: 'Disponibile per videochiamate' },
    { id: 'idle', label: 'Inattivo', color: '#F0B232', desc: 'Lontano dalla tastiera' },
    { id: 'dnd', label: 'Non disturbare', color: '#ED4245', desc: 'Nessuna notifica audio' },
    { id: 'invisible', label: 'Invisibile', color: '#80848E', desc: 'Risulti offline agli altri' },
];

const getProfile = () => {
    try { return JSON.parse(localStorage.getItem('gsa_user_profile') || '{}'); } catch { return {}; }
};
const saveProfile = (p) => {
    try { localStorage.setItem('gsa_user_profile', JSON.stringify(p)); } catch { }
};

const getStatus = () => {
    try { return JSON.parse(localStorage.getItem('gsa_user_status') || '"online"'); } catch { return 'online'; }
};
const saveStatus = (s) => {
    try { localStorage.setItem('gsa_user_status', JSON.stringify(s)); } catch { }
};

export const statusColor = (id) => STATUS_LIST.find(s => s.id === id)?.color || '#23A559';

export default function UserProfileCard({ visible, onClose, user, socket, onLogout }) {
    const [profile, setProfile] = useState(getProfile);
    const [status, setStatus] = useState(getStatus);
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [pic, setPic] = useState(null);
    const [showStatusMenu, setShowStatusMenu] = useState(false);

    useEffect(() => {
        if (visible) {
            const p = getProfile();
            setProfile(p);
            setName(p.username || user?.username || '');
            setBio(p.bio || user?.bio || '');
            setPic(p.profilePic || user?.profilePic || null);
            setStatus(getStatus());
            setShowStatusMenu(false);
        }
    }, [visible]);

    const handleSave = (key, val) => {
        const updated = { ...profile, [key]: val };
        setProfile(updated);
        saveProfile(updated);
        // Sync back to the user object prop if possible
        if (user) user[key] = val;

        if (key === 'bio') socket?.emit('user-bio', { bio: val });
        if (key === 'username') socket?.emit('user-rename', { username: val });
    };

    const handlePickPhoto = () => {
        if (Platform.OS !== 'web') return;
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = (e) => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader(); r.onload = ev => {
                setPic(ev.target.result);
                handleSave('profilePic', ev.target.result);
            };
            r.readAsDataURL(f);
        };
        inp.click();
    };

    const changeStatus = (id) => {
        setStatus(id);
        saveStatus(id);
        socket?.emit('user-status', { status: id });
        setShowStatusMenu(false);
    };

    const curStatus = STATUS_LIST.find(s => s.id === status);
    const initial = (name || user?.username || '?').charAt(0).toUpperCase();

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.container}>
                    {/* Main Card */}
                    <TouchableOpacity activeOpacity={1} style={styles.card}>
                        {/* Header / Avatar Edit */}
                        <View style={styles.header}>
                            <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto}>
                                {pic ? <Image source={{ uri: pic }} style={styles.avatar} /> : (
                                    <View style={styles.avatarPlaceholder}><Text style={styles.avatarTxt}>{initial}</Text></View>
                                )}
                                <View style={styles.editIcon}><Icon name="camera" size={12} color="#111" /></View>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Icon name="x" size={16} color="#554E40" /></TouchableOpacity>
                        </View>

                        {/* Name Input */}
                        <View style={styles.fieldRow}>
                            <TextInput
                                style={[styles.nameInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                                value={name}
                                onChangeText={setName}
                                onBlur={() => handleSave('username', name)}
                                placeholder="Tuo Nome"
                                placeholderTextColor="#554E40"
                            />
                            <Text style={styles.station}>{user?.station}</Text>
                        </View>

                        {/* Bio Input */}
                        <View style={styles.bioBox}>
                            <Text style={styles.label}>BIO</Text>
                            <TextInput
                                style={[styles.bioInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                                value={bio}
                                onChangeText={setBio}
                                onBlur={() => handleSave('bio', bio)}
                                placeholder="Raccontaci qualcosa..."
                                placeholderTextColor="#3A3630"
                                multiline
                            />
                        </View>

                        <View style={styles.divider} />

                        {/* Discord-style Status Row */}
                        <TouchableOpacity
                            style={[styles.statusToggle, showStatusMenu && styles.statusToggleActive]}
                            onPress={() => setShowStatusMenu(!showStatusMenu)}
                        >
                            <View style={[styles.statusDot, { backgroundColor: curStatus.color }]} />
                            <Text style={styles.statusName}>{curStatus.label}</Text>
                            <Icon name="chevron-right" size={14} color="#554E40" />
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        {/* Logout at bottom */}
                        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                            <Icon name="log-out" size={16} color="#ED4245" />
                            <Text style={styles.logoutTxt}>Esci dal Sistema</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>

                    {/* Status Sub-menu (appears to the right) */}
                    {showStatusMenu && (
                        <View style={styles.statusMenu}>
                            <Text style={styles.menuTitle}>IMPOSTA STATO</Text>
                            {STATUS_LIST.map(s => {
                                const active = status === s.id;
                                return (
                                    <TouchableOpacity key={s.id} style={styles.menuItem} onPress={() => changeStatus(s.id)}>
                                        <View style={[styles.menuDot, { backgroundColor: s.color }, !active && { backgroundColor: 'transparent', borderWidth: 2, borderColor: s.color }]} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.menuItemLabel, active && { color: '#C8C4B8' }]}>{s.label}</Text>
                                            <Text style={styles.menuItemDesc}>{s.desc}</Text>
                                        </View>
                                        {active && <View style={[styles.menuCheck, { borderColor: s.color }]}><View style={[styles.menuCheckInner, { backgroundColor: s.color }]} /></View>}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'flex-start' },
    container: { flexDirection: 'row', alignItems: 'flex-end', marginLeft: 16, marginBottom: 70, gap: 10 },

    card: {
        width: 300, backgroundColor: '#16140F', borderRadius: 14, padding: 18, gap: 12,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    avatarWrap: { position: 'relative' },
    avatar: { width: 70, height: 70, borderRadius: 20, borderWidth: 2, borderColor: '#C9A84C' },
    avatarPlaceholder: { width: 70, height: 70, borderRadius: 20, backgroundColor: '#2A2217', borderWidth: 2, borderColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },
    avatarTxt: { color: '#C9A84C', fontSize: 28, fontWeight: '800' },
    editIcon: { position: 'absolute', bottom: -4, right: -4, backgroundColor: '#C9A84C', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#16140F' },
    closeBtn: { padding: 4 },

    fieldRow: { gap: 2 },
    nameInput: { color: '#C8C4B8', fontSize: 20, fontWeight: '800', padding: 0 },
    station: { color: '#554E40', fontSize: 13, fontWeight: '600', letterSpacing: 1 },

    label: { color: '#554E40', fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 4 },
    bioBox: { backgroundColor: '#0E0D0C', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.08)' },
    bioInput: { color: '#A8A090', fontSize: 14, minHeight: 60, lineHeight: 20, textAlignVertical: 'top' },

    divider: { height: 1, backgroundColor: 'rgba(201,168,76,0.06)' },

    statusToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8 },
    statusToggleActive: { backgroundColor: 'rgba(201,168,76,0.08)' },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusName: { flex: 1, color: '#A8A090', fontSize: 15, fontWeight: '600' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8 },
    logoutTxt: { color: '#ED4245', fontSize: 14, fontWeight: '700' },

    // Status Menu (Discord-style)
    statusMenu: {
        width: 260, backgroundColor: '#1A1812', borderRadius: 12, padding: 12, gap: 4,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
        shadowColor: '#000', shadowOffset: { width: 10, height: 0 }, shadowOpacity: 0.4, shadowRadius: 15,
        marginBottom: 20,
    },
    menuTitle: { color: '#554E40', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8 },
    menuDot: { width: 12, height: 12, borderRadius: 6 },
    menuItemLabel: { color: '#6E6960', fontSize: 15, fontWeight: '700' },
    menuItemDesc: { color: '#3A3630', fontSize: 11, marginTop: 1 },
    menuCheck: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    menuCheckInner: { width: 6, height: 6, borderRadius: 3 },
});
