import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Modal, StyleSheet, TouchableOpacity,
    Dimensions, Platform, Image, ScrollView
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { mediaDevices } from '../utils/webrtc';
import Animated, { SlideInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// Tabs
const TABS = ['Profilo', 'Dispositivi'];

export default function MediaSettings({ visible, onClose, onUpdateDevices, user }) {
    const [activeTab, setActiveTab] = useState('Profilo');

    // Device state
    const [videoDevices, setVideoDevices] = useState([]);
    const [audioInputDevices, setAudioInputDevices] = useState([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState('');
    const [selectedAudioInput, setSelectedAudioInput] = useState('');
    const [selectedAudioOutput, setSelectedAudioOutput] = useState('');

    // Profile/Connection state
    const [ping, setPing] = useState(null);
    const [connStatus, setConnStatus] = useState('Misurazione...');
    const pingInterval = useRef(null);

    useEffect(() => {
        if (visible) {
            loadDevices();
            startPingMeasurement();
        } else {
            if (pingInterval.current) clearInterval(pingInterval.current);
        }
        return () => {
            if (pingInterval.current) clearInterval(pingInterval.current);
        };
    }, [visible]);

    const loadDevices = async () => {
        try {
            const devices = await mediaDevices.enumerateDevices();
            const video = devices.filter(d => d.kind === 'videoinput');
            const audioIn = devices.filter(d => d.kind === 'audioinput');
            const audioOut = devices.filter(d => d.kind === 'audiooutput');
            setVideoDevices(video);
            setAudioInputDevices(audioIn);
            setAudioOutputDevices(audioOut);
            if (video.length > 0 && !selectedVideo) setSelectedVideo(video[0].deviceId);
            if (audioIn.length > 0 && !selectedAudioInput) setSelectedAudioInput(audioIn[0].deviceId);
            if (audioOut.length > 0 && !selectedAudioOutput) setSelectedAudioOutput(audioOut[0].deviceId);
        } catch (e) {
            console.error('Errore nel caricamento dei dispositivi', e);
        }
    };

    const startPingMeasurement = () => {
        const measurePing = async () => {
            try {
                const signalingUrl = process.env.EXPO_PUBLIC_SIGNALING_URL || 'https://hotel-reception-app.onrender.com';
                const start = Date.now();
                await fetch(`${signalingUrl}/ping`, { method: 'GET', cache: 'no-store' });
                const latency = Date.now() - start;
                setPing(latency);
                if (latency < 100) setConnStatus('Eccellente 🟢');
                else if (latency < 250) setConnStatus('Buono 🟡');
                else setConnStatus('Lento 🔴');
            } catch (e) {
                setPing(null);
                setConnStatus('Disconnesso ❌');
            }
        };
        measurePing();
        pingInterval.current = setInterval(measurePing, 5000);
    };

    const handleApply = () => {
        onUpdateDevices({
            videoDeviceId: selectedVideo,
            audioDeviceId: selectedAudioInput,
            audioOutputId: selectedAudioOutput,
        });
        onClose();
    };

    // Profile picture placeholder – initials avatar
    const initials = user?.username ? user.username.charAt(0).toUpperCase() : '?';

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                {visible && (
                    <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.modalWrapper}>
                        <LinearGradient colors={['rgba(30, 30, 35, 0.97)', 'rgba(12, 12, 18, 0.99)']} style={styles.modalContent}>

                            {/* Header */}
                            <View style={styles.headerRow}>
                                <Text style={styles.title}>IMPOSTAZIONI</Text>
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                    <Text style={styles.closeTxt}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Tab Bar */}
                            <View style={styles.tabBar}>
                                {TABS.map(tab => (
                                    <TouchableOpacity
                                        key={tab}
                                        style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                                        onPress={() => setActiveTab(tab)}
                                    >
                                        <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
                                            {tab}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} style={styles.tabBody}>

                                {/* --- PROFILO TAB --- */}
                                {activeTab === 'Profilo' && (
                                    <Animated.View entering={FadeIn.duration(200)}>
                                        {/* Avatar */}
                                        <View style={styles.avatarSection}>
                                            <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.avatarCircle}>
                                                <Text style={styles.avatarInitial}>{initials}</Text>
                                            </LinearGradient>
                                            <View style={styles.avatarInfo}>
                                                <Text style={styles.usernameLabel}>Nome Utente</Text>
                                                <Text style={styles.usernameValue}>{user?.username || '—'}</Text>
                                                <Text style={styles.stationLabel}>{user?.station || ''}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.divider} />

                                        {/* Connection Info */}
                                        <Text style={styles.sectionLabel}>CONNESSIONE AL SERVER</Text>
                                        <View style={styles.infoCard}>
                                            <View style={styles.infoRow}>
                                                <Text style={styles.infoKey}>Stato</Text>
                                                <Text style={[styles.infoValue, connStatus.includes('Eccellente') ? styles.statusGreen : connStatus.includes('Buono') ? styles.statusYellow : styles.statusRed]}>
                                                    {connStatus}
                                                </Text>
                                            </View>
                                            <View style={styles.infoRow}>
                                                <Text style={styles.infoKey}>Ping</Text>
                                                <Text style={[styles.infoValue, ping && ping < 100 ? styles.statusGreen : ping && ping < 250 ? styles.statusYellow : styles.statusRed]}>
                                                    {ping !== null ? `${ping} ms` : '— ms'}
                                                </Text>
                                            </View>
                                            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                                <Text style={styles.infoKey}>Server</Text>
                                                <Text style={[styles.infoValue, { fontSize: 11 }]}>
                                                    {(process.env.EXPO_PUBLIC_SIGNALING_URL || 'localhost').replace('https://', '')}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.divider} />

                                        {/* Logout */}
                                        <TouchableOpacity style={styles.dangerBtn} onPress={onClose} activeOpacity={0.8}>
                                            <Text style={styles.dangerTxt}>Chiudi Impostazioni</Text>
                                        </TouchableOpacity>
                                    </Animated.View>
                                )}

                                {/* --- DISPOSITIVI TAB --- */}
                                {activeTab === 'Dispositivi' && (
                                    <Animated.View entering={FadeIn.duration(200)}>
                                        <View style={styles.settingGroup}>
                                            <Text style={styles.label}>🎥  FOTOCAMERA</Text>
                                            <View style={styles.pickerContainer}>
                                                <Picker
                                                    selectedValue={selectedVideo}
                                                    onValueChange={setSelectedVideo}
                                                    style={styles.picker}
                                                    dropdownIconColor="#D4AF37"
                                                >
                                                    {videoDevices.length > 0
                                                        ? videoDevices.map(d => <Picker.Item key={d.deviceId} label={d.label || 'Webcam'} value={d.deviceId} />)
                                                        : <Picker.Item label="Nessuna fotocamera trovata" value="" />
                                                    }
                                                </Picker>
                                            </View>
                                        </View>

                                        <View style={styles.settingGroup}>
                                            <Text style={styles.label}>🎙  MICROFONO</Text>
                                            <View style={styles.pickerContainer}>
                                                <Picker
                                                    selectedValue={selectedAudioInput}
                                                    onValueChange={setSelectedAudioInput}
                                                    style={styles.picker}
                                                    dropdownIconColor="#D4AF37"
                                                >
                                                    {audioInputDevices.length > 0
                                                        ? audioInputDevices.map(d => <Picker.Item key={d.deviceId} label={d.label || 'Microfono'} value={d.deviceId} />)
                                                        : <Picker.Item label="Nessun microfono trovato" value="" />
                                                    }
                                                </Picker>
                                            </View>
                                        </View>

                                        <View style={styles.settingGroup}>
                                            <Text style={styles.label}>🔊  ALTOPARLANTI</Text>
                                            <View style={styles.pickerContainer}>
                                                <Picker
                                                    selectedValue={selectedAudioOutput}
                                                    onValueChange={setSelectedAudioOutput}
                                                    style={styles.picker}
                                                    dropdownIconColor="#D4AF37"
                                                >
                                                    {audioOutputDevices.length > 0
                                                        ? audioOutputDevices.map(d => <Picker.Item key={d.deviceId} label={d.label || 'Speaker'} value={d.deviceId} />)
                                                        : <Picker.Item label="Uscita Audio Predefinita" value="default" />
                                                    }
                                                </Picker>
                                            </View>
                                        </View>

                                        {/* Apply Button */}
                                        <View style={styles.buttonRow}>
                                            <TouchableOpacity style={styles.cancelWrap} onPress={onClose} activeOpacity={0.8}>
                                                <Text style={styles.cancelText}>ANNULLA</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.applyWrap} onPress={handleApply} activeOpacity={0.8}>
                                                <LinearGradient colors={['#D4AF37', '#AA8C2C']} style={styles.applyGradient}>
                                                    <Text style={styles.buttonText}>APPLICA</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    </Animated.View>
                                )}
                            </ScrollView>
                        </LinearGradient>
                    </Animated.View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalWrapper: {
        width: '95%',
        maxWidth: 520,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.9,
        shadowRadius: 40,
        elevation: 20,
    },
    modalContent: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 30,
        overflow: 'hidden',
        maxHeight: height * 0.85,
    },

    // Header
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 25,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 22,
        letterSpacing: 4,
        fontWeight: '300',
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },

    // Tab Bar
    tabBar: {
        flexDirection: 'row',
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.3)',
        padding: 4,
        marginBottom: 25,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    tabBtnActive: {
        backgroundColor: 'rgba(212, 175, 55, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.4)',
    },
    tabTxt: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 13, letterSpacing: 1 },
    tabTxtActive: { color: '#D4AF37' },

    tabBody: { maxHeight: height * 0.55 },

    // Profile Tab
    avatarSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 25,
    },
    avatarCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
    },
    avatarInitial: { color: '#000', fontSize: 30, fontWeight: '800' },
    avatarInfo: { marginLeft: 20 },
    usernameLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 2, marginBottom: 4 },
    usernameValue: { color: '#FFF', fontSize: 20, fontWeight: '600', letterSpacing: 1 },
    stationLabel: { color: '#D4AF37', fontSize: 12, marginTop: 4, letterSpacing: 1 },

    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 20 },

    sectionLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '600',
        marginBottom: 12,
    },
    infoCard: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    infoKey: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
    infoValue: { fontSize: 13, fontWeight: '600' },
    statusGreen: { color: '#4BFF4B' },
    statusYellow: { color: '#FFCC00' },
    statusRed: { color: '#FF4B4B' },

    dangerBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(255,75,75,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,75,75,0.25)',
    },
    dangerTxt: { color: '#FF4B4B', fontWeight: '600', letterSpacing: 1, fontSize: 13 },

    // Devices Tab
    settingGroup: { marginBottom: 20 },
    label: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
        letterSpacing: 2,
        marginBottom: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    pickerContainer: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderRadius: 14,
        overflow: 'hidden',
    },
    picker: { color: '#FFF', height: 58 },

    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 25,
        marginBottom: 10,
    },
    cancelWrap: { flex: 0.45, alignItems: 'center', paddingVertical: 15 },
    cancelText: { color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 2, fontSize: 12 },
    applyWrap: { flex: 0.5 },
    applyGradient: {
        width: '100%',
        paddingVertical: 15,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    buttonText: { color: '#111', fontWeight: '700', letterSpacing: 1.5, fontSize: 13 },
});
