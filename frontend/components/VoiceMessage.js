/**
 * VoiceMessage.js — v2.5.0
 * Voice memo recorder component for the chat input bar.
 * Recording: MediaRecorder API (web only). Sends as base64 audio.
 * Playback bubble: unique waveform bars + scrub slider.
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Icon } from './Icons';

// ─── Recorder button (inline in input bar) ─────────────────────────────────
export function VoiceRecorderButton({ onSend, disabled }) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [cancelled, setCancelled] = useState(false);
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (recording) {
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            clearInterval(timerRef.current);
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
            setSeconds(0);
        }
        return () => clearInterval(timerRef.current);
    }, [recording]);

    const startRecording = async () => {
        if (Platform.OS !== 'web') return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (!cancelled) {
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = ev => onSend(ev.target.result, seconds);
                    reader.readAsDataURL(blob);
                }
                setCancelled(false);
            };
            mr.start();
            mediaRef.current = mr;
            setRecording(true);
        } catch (e) { console.error('mic access denied', e); }
    };

    const stopRecording = (cancel = false) => {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
            setCancelled(cancel);
            mediaRef.current.stop();
        }
        setRecording(false);
    };

    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    if (recording) {
        return (
            <View style={styles.recordingRow}>
                {/* Cancel */}
                <TouchableOpacity onPress={() => stopRecording(true)} style={styles.cancelBtn}>
                    <Icon name="x" size={14} color="#ED4245" />
                </TouchableOpacity>
                {/* Timer */}
                <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.recTimer}>{fmt(seconds)}</Text>
                {/* Send */}
                <TouchableOpacity onPress={() => stopRecording(false)} style={styles.sendVoiceBtn}>
                    <Icon name="send" size={14} color="#111" />
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <TouchableOpacity style={[styles.micBtn, disabled && { opacity: 0.4 }]} onPress={startRecording} disabled={disabled}>
            <Icon name="mic" size={18} color="#C8C4B8" />
        </TouchableOpacity>
    );
}

// ─── Playback bubble ─────────────────────────────────────────────────────
// Unique waveform: synthetic bars that animate on play
const BAR_COUNT = 24;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.9)));

export function VoiceMessageBubble({ src, duration = 0, isMine }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef(null);
    const rafRef = useRef(null);
    const barAnims = useRef(BARS.map(() => new Animated.Value(0.5))).current;
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.oncanplaythrough = () => setLoaded(true);
        audio.onended = () => { setPlaying(false); setProgress(0); cancelAnimationFrame(rafRef.current); };
        return () => { audio.pause(); cancelAnimationFrame(rafRef.current); };
    }, [src]);

    const animateBars = (active) => {
        barAnims.forEach((anim, i) => {
            if (active) {
                Animated.loop(Animated.sequence([
                    Animated.timing(anim, { toValue: BARS[i], duration: 200 + i * 20, useNativeDriver: false }),
                    Animated.timing(anim, { toValue: 0.2, duration: 200 + i * 20, useNativeDriver: false }),
                ])).start();
            } else {
                anim.stopAnimation();
                Animated.timing(anim, { toValue: BARS[i] * 0.5, duration: 200, useNativeDriver: false }).start();
            }
        });
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
            animateBars(false);
            cancelAnimationFrame(rafRef.current);
        } else {
            audioRef.current.play();
            setPlaying(true);
            animateBars(true);
            const tick = () => {
                const a = audioRef.current;
                if (a && a.duration) setProgress(a.currentTime / a.duration);
                rafRef.current = requestAnimationFrame(tick);
            };
            tick();
        }
    };

    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const accentColor = isMine ? 'rgba(201,168,76,0.9)' : '#6E6960';

    return (
        <View style={[styles.voiceBubble, isMine && styles.voiceBubbleMine]}>
            {/* Play button */}
            <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: isMine ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.07)' }]}>
                <Icon name={playing ? 'pause' : 'play'} size={15} color={isMine ? '#C9A84C' : '#A8A090'} />
            </TouchableOpacity>

            {/* Waveform bars */}
            <View style={styles.waveform}>
                {barAnims.map((anim, i) => {
                    const filled = progress * BAR_COUNT > i;
                    return (
                        <Animated.View key={i} style={[styles.bar, {
                            backgroundColor: filled ? accentColor : (isMine ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.12)'),
                            transform: [{ scaleY: anim }]
                        }]} />
                    );
                })}
            </View>

            {/* Duration */}
            <Text style={[styles.voiceDur, isMine && { color: 'rgba(201,168,76,0.7)' }]}>
                {fmt(playing && audioRef.current ? audioRef.current.currentTime : duration)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // Recorder row
    recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, backgroundColor: '#1A1812', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(237,66,69,0.3)' },
    recDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#ED4245' },
    recTimer: { flex: 1, color: '#C8C4B8', fontSize: 14, fontWeight: '600' },
    cancelBtn: { padding: 4 },
    sendVoiceBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },
    micBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },

    // Playback bubble
    voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', minWidth: 200 },
    voiceBubbleMine: { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
    playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    waveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 32 },
    bar: { flex: 1, borderRadius: 2, width: 3 },
    voiceDur: { color: '#554E40', fontSize: 11, fontWeight: '600', minWidth: 32, textAlign: 'right' },
});
