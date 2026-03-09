import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { mediaDevices } from '../utils/webrtc';
import Animated, { SlideInDown, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function MediaSettings({ visible, onClose, onUpdateDevices }) {
    const [videoDevices, setVideoDevices] = useState([]);
    const [audioInputDevices, setAudioInputDevices] = useState([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState([]);

    const [selectedVideo, setSelectedVideo] = useState('');
    const [selectedAudioInput, setSelectedAudioInput] = useState('');
    const [selectedAudioOutput, setSelectedAudioOutput] = useState('');

    useEffect(() => {
        if (visible) {
            loadDevices();
        }
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

    const handleApply = () => {
        onUpdateDevices({
            videoDeviceId: selectedVideo,
            audioDeviceId: selectedAudioInput,
            audioOutputId: selectedAudioOutput
        });
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>

                {visible && (
                    <Animated.View entering={SlideInDown.springify().damping(15)} style={styles.modalWrapper}>
                        <LinearGradient colors={['rgba(30, 30, 35, 0.95)', 'rgba(15, 15, 20, 0.98)']} style={styles.modalContent}>
                            <View style={styles.headerContainer}>
                                <Text style={styles.title}>IMPOSTAZIONI</Text>
                            </View>

                            <View style={styles.settingGroup}>
                                <Text style={styles.label}>FOTOCAMERA</Text>
                                <View style={styles.pickerContainer}>
                                    <Picker
                                        selectedValue={selectedVideo}
                                        onValueChange={(val) => setSelectedVideo(val)}
                                        style={styles.picker}
                                        dropdownIconColor="#000"
                                    >
                                        {videoDevices.map(d => (
                                            <Picker.Item key={d.deviceId} label={d.label || 'Webcam'} value={d.deviceId} />
                                        ))}
                                    </Picker>
                                </View>
                            </View>

                            <View style={styles.settingGroup}>
                                <Text style={styles.label}>MICROFONO D'INGRESSO</Text>
                                <View style={styles.pickerContainer}>
                                    <Picker
                                        selectedValue={selectedAudioInput}
                                        onValueChange={(val) => setSelectedAudioInput(val)}
                                        style={styles.picker}
                                        dropdownIconColor="#000"
                                    >
                                        {audioInputDevices.map(d => (
                                            <Picker.Item key={d.deviceId} label={d.label || 'Microfono Esterno'} value={d.deviceId} />
                                        ))}
                                    </Picker>
                                </View>
                            </View>

                            <View style={styles.settingGroup}>
                                <Text style={styles.label}>ALTOPARLANTI / USCITA</Text>
                                <View style={styles.pickerContainer}>
                                    <Picker
                                        selectedValue={selectedAudioOutput}
                                        onValueChange={(val) => setSelectedAudioOutput(val)}
                                        style={styles.picker}
                                        dropdownIconColor="#000"
                                    >
                                        {audioOutputDevices.length > 0 ? audioOutputDevices.map(d => (
                                            <Picker.Item key={d.deviceId} label={d.label || 'Speaker Sistema'} value={d.deviceId} />
                                        )) : (
                                            <Picker.Item label="Uscita Audio Predefinita" value="default" />
                                        )}
                                    </Picker>
                                </View>
                            </View>

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
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalWrapper: {
        width: '95%',
        maxWidth: 500,
        borderRadius: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.8,
        shadowRadius: 30,
        elevation: 20,
    },
    modalContent: {
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 35,
        overflow: 'hidden',
    },
    headerContainer: {
        marginBottom: 35,
        alignItems: 'center'
    },
    title: {
        color: '#FFFFFF',
        fontSize: 24,
        letterSpacing: 4,
        fontWeight: '300',
        fontFamily: Platform.OS === 'web' ? 'sans-serif' : (Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-light')
    },
    settingGroup: {
        marginBottom: 25,
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        letterSpacing: 2,
        marginBottom: 10,
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    pickerContainer: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        overflow: 'hidden'
    },
    picker: {
        color: '#FFF',
        height: 60,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 30,
    },
    cancelWrap: { flex: 0.45, alignItems: 'center', paddingVertical: 15 },
    cancelText: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        letterSpacing: 2,
        fontSize: 12
    },
    applyWrap: { flex: 0.5 },
    applyGradient: {
        width: '100%',
        paddingVertical: 15,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    buttonText: {
        color: '#111',
        fontWeight: '700',
        letterSpacing: 1.5,
        fontSize: 13
    }
});
