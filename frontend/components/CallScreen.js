/**
 * CallScreen.js — v2.5.0
 * Converted to a full-screen overlay.
 * Removed lobby and rooms list (now in HotelChat sidebar).
 * Handles video calls, controls, and in-call chat slide.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
    Dimensions, Platform, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icons';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView } from '../utils/webrtc';

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

const { width: W, height: H } = Dimensions.get('window');
const IS_MOBILE = W < 768;

export default function CallScreen({ user, socket, roomId, onClose, isTempProp, onRoomState }) {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [expandedVideo, setExpandedVideo] = useState(false);

    const [chatVisible, setChatVisible] = useState(false);
    const chatAnim = useRef(new Animated.Value(0)).current;

    const pcRef = useRef(null);

    // ── Call Lifecycle ──────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !roomId) return;
        startLocalStream();

        const onUserJoined = async ({ socketId, username }) => {
            console.log('User joined room:', username);
            const pc = await createPC(socketId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { target: socketId, offer, sender: socket.id });
        };

        const onOffer = async ({ sender, offer }) => {
            const pc = await createPC(sender);
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { target: sender, answer });
        };

        const onAnswer = async ({ sender, answer }) => {
            if (pcRef.current) await pcRef.current.setRemoteDescription(answer);
        };

        const onIce = async ({ sender, candidate }) => {
            if (pcRef.current) await pcRef.current.addIceCandidate(candidate);
        };

        const onUserLeft = () => {
            setRemoteStream(null);
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        };

        socket.on('user-joined-room', onUserJoined);
        socket.on('offer', onOffer);
        socket.on('answer', onAnswer);
        socket.on('ice-candidate', onIce);
        socket.on('user-left-room', onUserLeft);

        return () => {
            socket.off('user-joined-room');
            socket.off('offer');
            socket.off('answer');
            socket.off('ice-candidate');
            socket.off('user-left-room');
            stopLocalStream();
        };
    }, [socket, roomId]);

    const startLocalStream = async () => {
        try {
            const stream = await mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
            setLocalStream(stream);
            return stream;
        } catch (e) { console.error('Local stream failed', e); }
    };

    const stopLocalStream = () => {
        localStream?.getTracks().forEach(t => t.stop());
        setLocalStream(null);
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    };

    const createPC = async (targetId) => {
        const pc = new RTCPeerConnection(ICE_CONFIG);
        pcRef.current = pc;
        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        pc.ontrack = (e) => { if (e.streams[0]) setRemoteStream(e.streams[0]); };
        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
        };
        return pc;
    };

    const toggleMic = () => {
        if (localStream) {
            const t = localStream.getAudioTracks()[0];
            if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
        }
    };

    const toggleCam = () => {
        if (localStream) {
            const t = localStream.getVideoTracks()[0];
            if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
        }
    };

    // ── Animation ──────────────────────────────────────────────────────
    useEffect(() => {
        Animated.spring(chatAnim, { toValue: chatVisible ? 1 : 0, useNativeDriver: false, damping: 20 }).start();
    }, [chatVisible]);

    const chatWidth = chatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });

    return (
        <View style={styles.root}>
            <LinearGradient colors={['#0C0B09', '#141210']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.roomBadge}>
                    <Icon name="video" size={14} color="#C9A84C" />
                    <Text style={styles.roomName}>STANZA #{roomId}</Text>
                    {isTempProp && <View style={styles.tempBadge}><Text style={styles.tempTxt}>TEMP</Text></View>}
                </View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.closeBtn} onPress={() => { socket.emit('leave-room'); onClose(); }}>
                    <Icon name="x" size={20} color="#554E40" />
                </TouchableOpacity>
            </View>

            {/* Video Grid */}
            <View style={styles.grid}>
                <View style={styles.videoContainer}>
                    <View style={[styles.tile, remoteStream ? styles.tileSide : styles.tileCenter]}>
                        {camOn && localStream ? (
                            <RTCView streamURL={localStream.toURL()} style={styles.rtc} objectFit="cover" />
                        ) : (
                            <View style={styles.avatarTile}><Text style={styles.avatarTxt}>{(user.username || '?')[0]}</Text></View>
                        )}
                        <View style={styles.nameOverlay}><Text style={styles.nameTxt}>Tu</Text></View>
                    </View>

                    {remoteStream && (
                        <View style={[styles.tile, styles.tileSide]}>
                            <RTCView streamURL={remoteStream.toURL()} style={styles.rtc} objectFit="cover" />
                            <View style={styles.nameOverlay}><Text style={styles.nameTxt}>Ospite</Text></View>
                        </View>
                    )}
                </View>

                {/* Chat Slide */}
                <Animated.View style={[styles.chatSlide, { width: chatWidth, opacity: chatAnim }]}>
                    <View style={styles.chatHeader}>
                        <Text style={styles.chatTitle}>CHAT DI GRUPPO</Text>
                        <TouchableOpacity onPress={() => setChatVisible(false)}><Icon name="x" size={16} color="#554E40" /></TouchableOpacity>
                    </View>
                    <ScrollView style={{ flex: 1, padding: 12 }}>
                        <Text style={styles.chatEmpty}>La chat della stanza è temporanea e non viene salvata.</Text>
                    </ScrollView>
                </Animated.View>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]} onPress={toggleMic}>
                    <Icon name={micOn ? 'mic' : 'mic-off'} size={20} color={micOn ? '#C8C4B8' : '#ED4245'} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ctrlBtn, !camOn && styles.ctrlBtnOff]} onPress={toggleCam}>
                    <Icon name={camOn ? 'video' : 'video-off'} size={20} color={camOn ? '#C8C4B8' : '#ED4245'} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ctrlBtn, chatVisible && styles.ctrlBtnActive]} onPress={() => setChatVisible(!chatVisible)}>
                    <Icon name="message-square" size={20} color={chatVisible ? '#C9A84C' : '#C8C4B8'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.hangupBtn} onPress={() => { socket.emit('leave-room'); onClose(); }}>
                    <Icon name="phone-off" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, position: 'relative' },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, zIndex: 10 },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    roomName: { color: '#C8C4B8', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
    tempBadge: { backgroundColor: '#FF8C00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tempTxt: { color: '#000', fontSize: 9, fontWeight: '900' },
    closeBtn: { padding: 8 },

    grid: { flex: 1, flexDirection: IS_MOBILE ? 'column' : 'row' },
    videoContainer: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 20 },
    tile: { backgroundColor: '#0A0908', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)', position: 'relative', elevation: 10 },
    tileCenter: { width: '80%', aspectRatio: 16 / 9, maxWidth: 900 },
    tileSide: { width: '45%', aspectRatio: 16 / 9, maxWidth: 600 },
    rtc: { flex: 1 },
    avatarTile: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1812' },
    avatarTxt: { color: '#C9A84C', fontSize: 48, fontWeight: '800' },
    nameOverlay: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    nameTxt: { color: '#C8C4B8', fontSize: 12, fontWeight: '600' },

    chatSlide: { backgroundColor: '#0E0D0C', borderLeftWidth: 1, borderLeftColor: 'rgba(201,168,76,0.08)' },
    chatHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.05)' },
    chatTitle: { color: '#554E40', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
    chatEmpty: { color: '#3A3630', fontSize: 13, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },

    controls: { height: 80, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingBottom: 10 },
    ctrlBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
    ctrlBtnOff: { backgroundColor: 'rgba(237,66,69,0.1)', borderColor: '#ED4245' },
    ctrlBtnActive: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: '#C9A84C' },
    hangupBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ED4245', justifyContent: 'center', alignItems: 'center', shadowColor: '#ED4245', shadowOpacity: 0.4, shadowRadius: 10 },
});
