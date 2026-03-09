/**
 * VoiceMessage.js — v2.5.0
 * Voice memo recorder component for the chat input bar.
 * Recording: MediaRecorder API (web only). Sends as base64 audio.
 * Playback bubble: unique waveform bars + scrub slider.
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Icon } from './Icons';

const playBeep = () => {
    if (Platform.OS !== 'web') return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) { }
};

export function VoiceRecorderButton({ onSend, disabled }) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [cancelled, setCancelled] = useState(false);
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Live visualizer state
    const [vols, setVols] = useState(Array(15).fill(2));
    const rafRef = useRef(null);

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
            playBeep();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            chunksRef.current = [];

            // Audio visualizer setup
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            const dataArr = new Uint8Array(analyser.frequencyBinCount);

            const tick = () => {
                analyser.getByteFrequencyData(dataArr);
                let sum = 0;
                for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
                let avg = sum / dataArr.length;
                // normalize to 2-20 scale
                let height = Math.max(2, Math.min(20, (avg / 256) * 30));
                setVols(prev => [...prev.slice(1), height]);
                rafRef.current = requestAnimationFrame(tick);
            };
            tick();

            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                ctx.close();
                cancelAnimationFrame(rafRef.current);
                setVols(Array(15).fill(2));
                if (!cancelled) {
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = ev => onSend(ev.target.result, seconds);
                    reader.readAsDataURL(blob);
                }
                setCancelled(false);
            };
            mr.start(100);
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
                {/* Timer & Live Visualizer */}
                <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.recTimer}>{fmt(seconds)}</Text>

                <View style={styles.liveWaveform}>
                    {vols.map((v, i) => (
                        <View key={i} style={[styles.liveBar, { height: v }]} />
                    ))}
                </View>
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
    const [speedIdx, setSpeedIdx] = useState(0);
    const SPEEDS = [1, 1.5, 2, 0.5];
    const audioRef = useRef(null);
    const rafRef = useRef(null);
    const barAnims = useRef(BARS.map(() => new Animated.Value(0.5))).current;
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.playbackRate = SPEEDS[speedIdx];
        audio.oncanplaythrough = () => setLoaded(true);
        audio.onended = () => { setPlaying(false); setProgress(0); cancelAnimationFrame(rafRef.current); };
        return () => { audio.pause(); cancelAnimationFrame(rafRef.current); };
    }, [src]);

    const animateBars = (active) => {
        // Bar animation is used only for the active recording now, but since we removed it from playback, 
        // this is kept just in case it's called somewhere, but does nothing for playback.
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

    const changeSpeed = () => {
        const next = (speedIdx + 1) % SPEEDS.length;
        setSpeedIdx(next);
        if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
    };

    const handleSeek = (e) => {
        if (!audioRef.current || !loaded) return;
        const x = Platform.OS === 'web' ? e.nativeEvent.offsetX : e.nativeEvent.locationX;
        const width = e.target.offsetWidth || 120;
        let p = x / width;
        if (p < 0) p = 0; if (p > 1) p = 1;
        audioRef.current.currentTime = p * audioRef.current.duration;
        setProgress(p);
    };

    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const accentColor = isMine ? 'rgba(201,168,76,0.9)' : '#6E6960';

    return (
        <View style={[styles.voiceBubble, isMine && styles.voiceBubbleMine]}>
            <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: isMine ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.07)' }]}>
                <Icon name={playing ? 'pause' : 'play'} size={15} color={isMine ? '#C9A84C' : '#A8A090'} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.waveformWrap} activeOpacity={1} onPress={handleSeek}>
                {/* Background track line */}
                <View style={[styles.waveLineTrack, { backgroundColor: isMine ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.15)' }]} />
                {/* Active progress line */}
                <View style={[styles.waveLineFill, { width: `${progress * 100}%`, backgroundColor: accentColor }]} pointerEvents="none" />
                {/* Scrubber Dot */}
                <View style={[styles.scrubberDot, { left: `calc(${progress * 100}% - 4px)`, backgroundColor: accentColor }]} pointerEvents="none" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.speedBtn} onPress={changeSpeed}>
                <Text style={styles.speedTxt}>{SPEEDS[speedIdx]}x</Text>
            </TouchableOpacity>
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
    liveWaveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20, flex: 1 },
    liveBar: { width: 3, backgroundColor: '#ED4245', borderRadius: 2 },

    // Playback bubble
    voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)' },
    voiceBubbleMine: { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
    playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    waveformWrap: { width: 120, height: 36, justifyContent: 'center', position: 'relative' },
    waveLineTrack: { position: 'absolute', top: '50%', left: 0, right: 0, height: 4, marginTop: -2, borderRadius: 2 },
    waveLineFill: { position: 'absolute', top: '50%', left: 0, height: 4, marginTop: -2, borderRadius: 2 },
    scrubberDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, top: '50%', marginTop: -5 },
    speedBtn: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    speedTxt: { color: '#C8C4B8', fontSize: 11, fontWeight: '800' },
});
