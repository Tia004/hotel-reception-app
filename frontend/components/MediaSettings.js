/**
 * MediaSettings.js — v2.5.0
 * Settings modal for user profile and media devices.
 * - Perfectly synced with UserProfileCard via gsa_user_profile localStorage.
 * - Profile: name, bio, profile picture.
 * - Dispositivi: selection for mic/cam/spk (synced with active call via gsa-device-change event).
 * - Layout: uniform gold/black design.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, Image, ScrollView } from 'react-native';
import { Icon } from './Icons';

const getProfile = () => { try { return JSON.parse(localStorage.getItem('gsa_user_profile') || '{}'); } catch { return {}; } };
const saveProfile = (p) => { try { localStorage.setItem('gsa_user_profile', JSON.stringify(p)); } catch { } };

export default function MediaSettings({ visible, onClose, user }) {
    const [activeTab, setActiveTab] = useState('profilo');
    const [profile, setProfile] = useState(getProfile);
    const [devices, setDevices] = useState({ audio: 'default', video: 'default', speaker: 'default' });
    const [availableDevices, setAvailableDevices] = useState([]);

    useEffect(() => {
        if (visible) {
            setProfile(getProfile());
            if (Platform.OS === 'web' && navigator.mediaDevices) {
                navigator.mediaDevices.enumerateDevices().then(setAvailableDevices);
                const saved = JSON.parse(localStorage.getItem('gsa_devices') || '{}');
                setDevices(p => ({ ...p, ...saved }));
            }
        }
    }, [visible]);

    const handleSave = (key, val) => {
        const updated = { ...profile, [key]: val };
        setProfile(updated);
        saveProfile(updated);
        // Force refresh of the global user object if it's the same reference
        if (user) user[key] = val;
    };

    const handleDeviceChange = (type, id) => {
        const next = { ...devices, [type]: id };
        setDevices(next);
        localStorage.setItem('gsa_devices', JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('gsa-device-change', { detail: next }));
    };

    const handlePickPhoto = () => {
        if (Platform.OS !== 'web') return;
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = (e) => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader(); r.onload = ev => {
                handleSave('profilePic', ev.target.result);
            };
            r.readAsDataURL(f);
        };
        inp.click();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Sidebar Tabs */}
                    <View style={styles.sidebar}>
                        <Text style={styles.sidebarLabel}>IMPOSTAZIONI UTENTE</Text>
                        <TouchableOpacity style={[styles.tab, activeTab === 'profilo' && styles.tabActive]} onPress={() => setActiveTab('profilo')}>
                            <Icon name="user" size={16} color={activeTab === 'profilo' ? '#C9A84C' : '#554E40'} />
                            <Text style={[styles.tabTxt, activeTab === 'profilo' && styles.tabTxtActive]}>Profilo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.tab, activeTab === 'dispositivi' && styles.tabActive]} onPress={() => setActiveTab('dispositivi')}>
                            <Icon name="mic" size={16} color={activeTab === 'dispositivi' ? '#C9A84C' : '#554E40'} />
                            <Text style={[styles.tabTxt, activeTab === 'dispositivi' && styles.tabTxtActive]}>Dispositivi</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Main Content */}
                    <View style={styles.content}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{activeTab.toUpperCase()}</Text>
                            <TouchableOpacity onPress={onClose}><Icon name="x" size={20} color="#554E40" /></TouchableOpacity>
                        </View>

                        <ScrollView style={styles.scroll}>
                            {activeTab === 'profilo' ? (
                                <View style={styles.form}>
                                    <View style={styles.avatarSection}>
                                        <TouchableOpacity onPress={handlePickPhoto}>
                                            <Image source={{ uri: profile.profilePic || 'https://via.placeholder.com/80' }} style={styles.avatarImg} />
                                            <View style={styles.avatarOverlay}><Icon name="edit-2" size={14} color="#000" /></View>
                                        </TouchableOpacity>
                                        <View>
                                            <Text style={styles.infoName}>{profile.username || user?.username}</Text>
                                            <Text style={styles.infoSub}>Gestisci la tua identità visiva</Text>
                                        </View>
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>NOME UTENTE</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={profile.username || user?.username}
                                            onChangeText={t => handleSave('username', t)}
                                            placeholder="Inserisci nome..." placeholderTextColor="#3A3630"
                                            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                        />
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>BIOGRAFIA</Text>
                                        <TextInput
                                            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                                            multiline value={profile.bio || ''}
                                            onChangeText={t => handleSave('bio', t)}
                                            placeholder="Il tuo motto o descrizione..." placeholderTextColor="#3A3630"
                                            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.form}>
                                    {['audio', 'video', 'speaker'].map(type => (
                                        <View key={type} style={styles.inputGroup}>
                                            <Text style={styles.label}>{type === 'audio' ? 'MICROFONO' : type === 'video' ? 'FOTOCAMERA' : 'ALTOPARLANTI'}</Text>
                                            <View style={styles.select}>
                                                <Icon name={type === 'audio' ? 'mic' : type === 'video' ? 'camera' : 'volume-2'} size={14} color="#C9A84C" />
                                                <select
                                                    style={styles.htmlSelect}
                                                    value={devices[type]}
                                                    onChange={e => handleDeviceChange(type, e.target.value)}
                                                >
                                                    <option value="default">Predefinito</option>
                                                    {availableDevices.filter(d => (type === 'audio' && d.kind === 'audioinput') || (type === 'video' && d.kind === 'videoinput') || (type === 'speaker' && d.kind === 'audiooutput')).map(d => (
                                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `${type} ${d.deviceId.slice(0, 5)}`}</option>
                                                    ))}
                                                </select>
                                                <Icon name="chevron-down" size={12} color="#554E40" />
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    container: { width: 800, height: 500, backgroundColor: '#100E0C', borderRadius: 20, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },

    sidebar: { width: 220, backgroundColor: '#0C0B0A', padding: 24, gap: 4 },
    sidebarLabel: { color: '#3A3630', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
    tab: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10 },
    tabActive: { backgroundColor: 'rgba(201,168,76,0.1)' },
    tabTxt: { color: '#554E40', fontSize: 15, fontWeight: '700' },
    tabTxtActive: { color: '#C9A84C' },

    content: { flex: 1, padding: 32 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    title: { color: '#C8C4B8', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    scroll: { flex: 1 },
    form: { gap: 24 },

    avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 10 },
    avatarImg: { width: 80, height: 80, borderRadius: 24, borderWidth: 2, borderColor: '#C9A84C' },
    avatarOverlay: { position: 'absolute', bottom: -5, right: -5, width: 26, height: 26, borderRadius: 8, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#100E0C' },
    infoName: { color: '#C8C4B8', fontSize: 22, fontWeight: '800' },
    infoSub: { color: '#554E40', fontSize: 13, marginTop: 4 },

    inputGroup: { gap: 10 },
    label: { color: '#C9A84C', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
    input: { backgroundColor: '#1A1812', borderRadius: 10, padding: 14, color: '#C8C4B8', fontSize: 15, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },

    select: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1812', borderRadius: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    htmlSelect: { flex: 1, background: 'transparent', border: 'none', color: '#C8C4B8', padding: '14px 4px', fontSize: '15px', appearance: 'none', outline: 'none' },
});
