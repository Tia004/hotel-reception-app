import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { mediaDevices } from '../utils/webrtc';
import Animated, { SlideInDown, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Funky Background Element Animation
const FunkyShape = ({ color, size, top, left, delay }) => {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    React.useEffect(() => {
        rotation.value = withDelay(delay, withRepeat(withTiming(360, { duration: 8000, easing: Easing.linear }), -1, false));
        scale.value = withDelay(delay, withRepeat(withSequence(withTiming(1.4, { duration: 1500 }), withTiming(0.8, { duration: 1500 })), -1, true));
    }, []);

    const animStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `${rotation.value}deg` },
                { scale: scale.value }
            ]
        };
    });

    return (
        <Animated.View style={[
            {
                position: 'absolute',
                top, left,
                width: size, height: size,
                backgroundColor: color,
                opacity: 0.9,
                borderWidth: 5,
                borderColor: '#000'
            },
            animStyle
        ]} />
    );
};


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
                    <Animated.View entering={SlideInDown.springify().damping(12)} style={styles.modalContent}>
                        <View style={styles.backgroundGrid} />
                        <FunkyShape color="#B2FF05" size={100} top={-20} left={-20} delay={0} />
                        <FunkyShape color="#00E5FF" size={80} top={100} left={width * 0.8} delay={500} />

                        <View style={styles.headerContainer}>
                            <Text style={styles.titleShadow}>IMPOSTAZIONI</Text>
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
                                <View style={styles.cancelShadow} />
                                <View style={styles.cancelFront}>
                                    <Text style={styles.cancelText}>X ANNULLA</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.applyWrap} onPress={handleApply} activeOpacity={0.8}>
                                <View style={styles.applyShadow} />
                                <View style={styles.applyFront}>
                                    <Text style={styles.buttonText}>APPLICA ➔</Text>
                                </View>
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
        backgroundColor: 'rgba(0, 0, 0, 0.85)', // Very dark overlay to contrast neon
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '95%',
        maxWidth: 600,
        backgroundColor: '#FF0055', // Hot Pink
        borderWidth: 6,
        borderColor: '#000',
        shadowColor: '#B2FF05',
        shadowOffset: { width: -15, height: 15 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 20,
        padding: 30,
        overflow: 'hidden',
        transform: [{ rotate: '-1deg' }] // Tilt
    },
    backgroundGrid: {
        position: 'absolute',
        width: '200%',
        height: '200%',
        opacity: 0.15,
        borderWidth: 2,
        borderColor: '#000',
        borderStyle: 'dashed'
    },
    headerContainer: {
        position: 'relative',
        marginBottom: 30,
        alignItems: 'center'
    },
    titleShadow: {
        color: '#000000',
        fontSize: 40,
        letterSpacing: -1,
        fontWeight: '900',
        position: 'absolute',
        top: 5, left: 5,
        fontFamily: 'Courier New'
    },
    title: {
        color: '#FFFFFF', // White
        fontSize: 40,
        letterSpacing: -1,
        textAlign: 'center',
        fontWeight: '900',
        fontFamily: 'Courier New'
    },
    settingGroup: {
        marginBottom: 25,
        backgroundColor: '#000',
        padding: 15,
        borderWidth: 3,
        borderColor: '#00E5FF', // Cyan
        transform: [{ rotate: '1deg' }]
    },
    label: {
        color: '#B2FF05', // Lime Green
        fontSize: 16,
        letterSpacing: 2,
        marginBottom: 10,
        fontWeight: '900',
        marginLeft: 5,
    },
    pickerContainer: {
        backgroundColor: '#FFFFFF',
        borderWidth: 4,
        borderColor: '#000',
        // Brutalist shadow trick internally
        borderBottomWidth: 8,
        borderRightWidth: 8,
    },
    picker: {
        color: '#000',
        height: 60,
        fontWeight: 'bold',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        height: 60
    },
    cancelWrap: { flex: 0.45, position: 'relative' },
    cancelShadow: { position: 'absolute', top: 5, left: 5, width: '100%', height: '100%', backgroundColor: '#000' },
    cancelFront: { width: '100%', height: '100%', backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },

    applyWrap: { flex: 0.5, position: 'relative' },
    applyShadow: { position: 'absolute', top: 5, left: 5, width: '100%', height: '100%', backgroundColor: '#000' },
    applyFront: { width: '100%', height: '100%', backgroundColor: '#B2FF05', borderWidth: 4, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },

    cancelText: {
        color: '#FF0055', // Hot Pink
        fontWeight: '900',
        letterSpacing: 1,
        fontSize: 18
    },
    buttonText: {
        color: '#000000',
        fontWeight: '900',
        letterSpacing: 1,
        fontSize: 18
    }
});
