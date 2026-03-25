import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, TextInput } from 'react-native';
import { RTCView, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } from '../utils/webrtc';
import { Icon } from './Icons';

export default function CallDebug({ socket, user, onClose }) {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [targetId, setTargetId] = useState('');
    const [status, setStatus] = useState('Pronto');
    const [logs, setLogs] = useState([]);
    const pcRef = useRef(null);

    const log = (msg) => {
        console.log('[DEBUG_CALL]', msg);
        setLogs(prev => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev].slice(0, 50));
    };

    const startLocalMedia = async () => {
        try {
            const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
            setLocalStream(stream);
            log('Media Locale OK');
        } catch (e) {
            log('Errore Media: ' + e.message);
        }
    };

    const createPC = (sid) => {
        if (pcRef.current) pcRef.current.close();
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        pcRef.current = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                log('Inviando Candidate');
                socket.emit('debug-ice', { target: sid, candidate: e.candidate });
            }
        };

        pc.oniceconnectionstatechange = () => {
            log('ICE State: ' + pc.iceConnectionState);
            setStatus(pc.iceConnectionState);
        };

        pc.ontrack = (e) => {
            log('Traccia Remota Ricevuta!');
            if (e.streams && e.streams[0]) {
                setRemoteStream(e.streams[0]);
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }

        return pc;
    };

    const startCall = async () => {
        if (!targetId) return log('Inserisci ID target');
        const pc = createPC(targetId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            log('Inviando Offerta');
            socket.emit('debug-offer', { target: targetId, offer });
        } catch (e) { log('Errore Offerta: ' + e.message); }
    };

    useEffect(() => {
        if (!socket) return;

        socket.on('debug-offer', async ({ sender, offer }) => {
            log('Offerta ricevuta da ' + sender);
            setTargetId(sender);
            const pc = createPC(sender);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('debug-answer', { target: sender, answer });
                log('Risposta inviata');
            } catch (e) { log('Errore Risposta: ' + e.message); }
        });

        socket.on('debug-answer', async ({ sender, answer }) => {
            log('Risposta ricevuta da ' + sender);
            if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socket.on('debug-ice', async ({ sender, candidate }) => {
            log('Candidate ricevuto');
            if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        return () => {
            socket.off('debug-offer');
            socket.off('debug-answer');
            socket.off('debug-ice');
            if (pcRef.current) pcRef.current.close();
        };
    }, [socket, localStream]);

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Text style={styles.title}>ENGINE TEST (1v1)</Text>
                <TouchableOpacity onPress={onClose}><Icon name="x" size={24} color="#FFF" /></TouchableOpacity>
            </View>

            <View style={styles.info}>
                <Text style={styles.infoTxt}>Il Tuo ID: <Text style={{ color: '#C9A84C' }}>{socket?.id}</Text></Text>
                <Text style={styles.infoTxt}>Stato: <Text style={{ fontWeight: '800' }}>{status}</Text></Text>
            </View>

            <View style={styles.videoArea}>
                <View style={styles.videoBox}>
                    <Text style={styles.tag}>LOCALE</Text>
                    {localStream && <RTCView streamURL={localStream.toURL ? localStream.toURL() : localStream} mirror muted={true} style={{ flex: 1 }} />}
                </View>
                <View style={styles.videoBox}>
                    <Text style={styles.tag}>REMOTA</Text>
                    {remoteStream && <RTCView streamURL={remoteStream.toURL ? remoteStream.toURL() : remoteStream} style={{ flex: 1 }} />}
                </View>
            </View>

            <View style={styles.controls}>
                <TouchableOpacity style={styles.btn} onPress={startLocalMedia}>
                    <Text style={styles.btnTxt}>1. Attiva Local Media</Text>
                </TouchableOpacity>
                <View style={[styles.btn, { backgroundColor: '#1C1A12', borderWidth: 1, borderColor: '#C9A84C', padding: 5 }]}>
                    <Text style={{ fontSize: 10, color: '#C9A84C', marginBottom: 5 }}>INCOLLA ID TARGET QUI:</Text>
                    <TextInput
                        style={{ color: '#FFF', width: '100%', textAlign: 'center', fontWeight: '800' }}
                        value={targetId}
                        onChangeText={setTargetId}
                        placeholder="Es. abc-123..."
                        placeholderTextColor="#444"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
                <TouchableOpacity style={styles.btnCall} onPress={startCall}>
                    <Text style={styles.btnTxt}>2. Chiama ID Sopra</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.logs}>
                {logs.map((L, i) => <Text key={i} style={styles.logTxt}>{L}</Text>)}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0C0B09', padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { color: '#C9A84C', fontWeight: '900', fontSize: 18 },
    info: { marginBottom: 20, gap: 4 },
    infoTxt: { color: '#E8E4D8', fontSize: 14 },
    videoArea: { flexDirection: 'row', height: 200, gap: 10, marginBottom: 20 },
    videoBox: { flex: 1, backgroundColor: '#141210', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
    tag: { position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: 10, padding: 4, zIndex: 10 },
    controls: { gap: 10, marginBottom: 20 },
    btn: { backgroundColor: '#2B2D31', padding: 15, borderRadius: 12, alignItems: 'center' },
    btnCall: { backgroundColor: '#C9A84C', padding: 15, borderRadius: 12, alignItems: 'center' },
    btnTxt: { color: '#FFF', fontWeight: '700' },
    logs: { flex: 1, backgroundColor: '#000', borderRadius: 12, padding: 10 },
    logTxt: { color: '#43B581', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 2 }
});
