/**
 * UserProfileCard.js — v2.4.0
 * Popover that opens when the user clicks their avatar in the sidebar footer.
 * Shows: avatar, username, bio, status selector.
 * Status is persisted in localStorage and broadcast via socket.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
import { Icon } from './Icons';

const STATUS_LIST = [
    { id: 'online', label: 'Online', color: '#23A559' },
    { id: 'idle', label: 'Inattivo', color: '#F0B232' },
    { id: 'dnd', label: 'Non disturbare', color: '#ED4245' },
    { id: 'invisible', label: 'Invisibile', color: '#80848E' },
];

const getStatus = () => { try { return JSON.parse(localStorage.getItem('gsa_user_status') || '"online"'); } catch { return 'online'; } };
const getBio = () => { try { return localStorage.getItem('gsa_user_bio') || ''; } catch { return ''; } };
const saveStatus = (s) => { try { localStorage.setItem('gsa_user_status', JSON.stringify(s)); } catch { } };
const saveBio = (b) => { try { localStorage.setItem('gsa_user_bio', b); } catch { } };

/** Returns the color for a given status id */
export const statusColor = (id) => STATUS_LIST.find(s => s.id === id)?.color || '#23A559';

export default function UserProfileCard({ visible, onClose, user, socket }) {
    const [status, setStatus] = useState(getStatus);
    const [bio, setBio] = useState(getBio);
    const [editingBio, setEditingBio] = useState(false);
    const [bioInput, setBioInput] = useState(bio);

    // Broadcast status on change
    useEffect(() => {
        if (!socket || !visible) return;
        socket.emit('user-status', { status });
    }, [status, socket, visible]);

    const changeStatus = (id) => {
        setStatus(id); saveStatus(id);
    };

    const saveBioEdit = () => {
        setBio(bioInput); saveBio(bioInput);
        setEditingBio(false);
        socket?.emit('user-bio', { bio: bioInput });
    };

    const initial = user?.username?.charAt(0)?.toUpperCase() || '?';
    const currentStatus = STATUS_LIST.find(s => s.id === status);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.card}>
                    {/* Avatar + close */}
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Icon name="x" size={16} color="#6E6960" />
                    </TouchableOpacity>

                    <View style={styles.avatarWrap}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarTxt}>{initial}</Text>
                        </View>
                        <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
                    </View>

                    <Text style={styles.username}>{user?.username}</Text>
                    <Text style={styles.station}>{user?.station}</Text>

                    {/* Bio */}
                    <View style={styles.bioSection}>
                        <View style={styles.bioHeader}>
                            <Text style={styles.bioLabel}>BIO</Text>
                            <TouchableOpacity onPress={() => { setBioInput(bio); setEditingBio(true); }}>
                                <Icon name="edit-2" size={12} color="#C9A84C" />
                            </TouchableOpacity>
                        </View>
                        {editingBio ? (
                            <View style={{ gap: 6 }}>
                                <TextInput
                                    style={styles.bioInput}
                                    value={bioInput}
                                    onChangeText={setBioInput}
                                    multiline
                                    placeholder="Scrivi qualcosa su di te..."
                                    placeholderTextColor="#554E40"
                                    autoFocus
                                    {...(Platform.OS === 'web' ? { style: [styles.bioInput, { outlineStyle: 'none' }] } : {})}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                                    <TouchableOpacity onPress={() => setEditingBio(false)}>
                                        <Text style={{ color: '#6E6960', fontSize: 13 }}>Annulla</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={saveBioEdit} style={styles.bioSaveBtn}>
                                        <Text style={{ color: '#111', fontWeight: '700', fontSize: 13 }}>Salva</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.bioText}>{bio || 'Nessuna bio impostata.'}</Text>
                        )}
                    </View>

                    {/* Status selector */}
                    <View style={styles.statusSection}>
                        <Text style={styles.statusLabel}>STATO</Text>
                        {STATUS_LIST.map(s => (
                            <TouchableOpacity
                                key={s.id}
                                style={[styles.statusRow, status === s.id && styles.statusRowActive]}
                                onPress={() => changeStatus(s.id)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.statusRowDot, { backgroundColor: s.color }]} />
                                <Text style={[styles.statusRowLabel, status === s.id && { color: '#C8C4B8' }]}>{s.label}</Text>
                                {status === s.id && <Icon name="check" size={13} color="#C9A84C" />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'flex-start' },
    card: {
        width: 280, marginLeft: 16, marginBottom: 70,
        backgroundColor: '#1A1812', borderRadius: 12, padding: 20, gap: 14,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)',
        ...(Platform.OS === 'web' ? { userSelect: 'none' } : {}),
    },
    closeBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
    avatarWrap: { alignSelf: 'flex-start', position: 'relative' },
    avatar: {
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: '#2A2217', borderWidth: 2, borderColor: '#C9A84C',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarTxt: { color: '#C9A84C', fontSize: 26, fontWeight: '700' },
    statusDot: { width: 14, height: 14, borderRadius: 7, position: 'absolute', bottom: 2, right: 2, borderWidth: 2, borderColor: '#1A1812' },
    username: { color: '#C8C4B8', fontSize: 18, fontWeight: '800', marginTop: 4 },
    station: { color: '#6E6960', fontSize: 13, marginTop: -8 },

    bioSection: { gap: 6 },
    bioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bioLabel: { color: '#6E6960', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
    bioText: { color: '#A8A090', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
    bioInput: { backgroundColor: '#0E0D0C', borderRadius: 6, padding: 10, color: '#C8C4B8', fontSize: 14, minHeight: 60, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    bioSaveBtn: { backgroundColor: '#C9A84C', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 5 },

    statusSection: { gap: 4 },
    statusLabel: { color: '#6E6960', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 6 },
    statusRowActive: { backgroundColor: 'rgba(201,168,76,0.08)' },
    statusRowDot: { width: 10, height: 10, borderRadius: 5 },
    statusRowLabel: { flex: 1, color: '#6E6960', fontSize: 15 },
});
