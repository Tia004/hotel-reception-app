import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { mediaDevices } from '../utils/webrtc';
import Animated, { SlideInDown, FadeIn } from 'react-native-reanimated';

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
                    <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.modalContent}>
                        <Text style={styles.title}>IMPOSTAZIONI MEDIA</Text>

                        <View style={styles.settingGroup}>
                            <Text style={styles.label}>FOTOCAMERA</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedVideo}
                                    onValueChange={(val) => setSelectedVideo(val)}
                                    style={styles.picker}
                                    dropdownIconColor="#739072"
                                >
                                    {videoDevices.map(d => (
                                        <Picker.Item key={d.deviceId} label={d.label || 'Webcam'} value={d.deviceId} />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        <View style={styles.settingGroup}>
                            <Text style={styles.label}>MICROFONO</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedAudioInput}
                                    onValueChange={(val) => setSelectedAudioInput(val)}
                                    style={styles.picker}
                                    dropdownIconColor="#739072"
                                >
                                    {audioInputDevices.map(d => (
                                        <Picker.Item key={d.deviceId} label={d.label || 'Microfono Esterno'} value={d.deviceId} />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        <View style={styles.settingGroup}>
                            <Text style={styles.label}>ALTOPARLANTI</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedAudioOutput}
                                    onValueChange={(val) => setSelectedAudioOutput(val)}
                                    style={styles.picker}
                                    dropdownIconColor="#739072"
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
                            <TouchableOpacity style={[styles.button, styles.cancelBtn]} onPress={onClose} activeOpacity={0.6}>
                                <Text style={styles.cancelText}>ANNULLA</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.button} onPress={handleApply} activeOpacity={0.8}>
                                <Text style={styles.buttonText}>APPLICA MODIFICHE</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(74, 59, 50, 0.4)', // Warm Espresso Wash
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 480,
        backgroundColor: '#F7EDE2', // Soft Peach/Dopamine Base
        borderRadius: 35, // Organic Squircle
        padding: 30,
        shadowColor: '#3A4D39',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.15,
        shadowRadius: 40,
        elevation: 10,
    },
    title: {
        color: '#3A4D39', // Forest Green
        fontSize: 22,
        letterSpacing: 1,
        marginBottom: 25,
        textAlign: 'center',
        fontWeight: '800'
    },
    settingGroup: {
        marginBottom: 25,
    },
    label: {
        color: '#DDA77B', // Soft Terracotta
        fontSize: 12,
        letterSpacing: 1,
        marginBottom: 10,
        fontWeight: '700',
        marginLeft: 5,
    },
    pickerContainer: {
        backgroundColor: '#FFFFFF', // Clean readable white for input
        borderRadius: 25, // Pill shape
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(231, 136, 101, 0.15)' // Subtle Terracotta border
    },
    picker: {
        color: '#4A3B32',
        height: 55,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 15,
    },
    button: {
        backgroundColor: '#739072', // Sage Green primary
        paddingVertical: 18,
        paddingHorizontal: 25,
        borderRadius: 30,
        flex: 1,
        alignItems: 'center',
        marginLeft: 10,
        shadowColor: '#739072',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 5,
    },
    cancelBtn: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: 'rgba(216, 92, 92, 0.4)', // Faded Red edge
        shadowOpacity: 0,
        elevation: 0,
        marginLeft: 0,
        marginRight: 10,
    },
    cancelText: {
        color: '#D85C5C', // Warm Red text
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: '800',
        letterSpacing: 0.5,
    }
});
