/**
 * VoiceMessage.js — v2.7.2
 * Full-width waveform, mic/mic-off icons for recording,
 * onRecordingChange callback to hide text input,
 * pause = preview, resume = append to recording.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Icon } from './Icons';

const playBeep = () => {
    if (Platform.OS !== 'web') return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch (e) { }
};

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Maximum bars visible in the waveform strip
const MAX_BARS = 50;

/**
 * VoiceRecorderButton
 * Props:
 *   onSend(base64data, durationSeconds)
 *   onRecordingChange(isActive) — called when recording starts/stops so parent can hide the text input
 *   disabled
 */
export function VoiceRecorderButton({ onSend, onRecordingChange, disabled }) {
    // 'idle' | 'recording' | 'paused'
    const [phase, setPhase] = useState('idle');
    const [seconds, setSeconds] = useState(0);
    const mediaRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);

    // Slide-in animation
    const slideAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Live waveform — bars scroll from right to left, each bar is a height value
    const [bars, setBars] = useState([]);
    const rafRef = useRef(null);

    // Notify parent of recording state
    useEffect(() => {
        onRecordingChange?.(phase !== 'idle');
    }, [phase]);

    // Slide animation
    useEffect(() => {
        Animated.spring(slideAnim, { toValue: phase !== 'idle' ? 1 : 0, useNativeDriver: false, damping: 18, stiffness: 160 }).start();
    }, [phase]);

    // Pulse when recording
    useEffect(() => {
        if (phase === 'recording') {
            Animated.loop(Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [phase]);

    // Timer
    useEffect(() => {
        if (phase === 'recording') {
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [phase]);

    // Audio analyser tick
    const startVisualizer = useCallback(() => {
        if (!analyserRef.current) return;
        const analyser = analyserRef.current;
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        let frameCount = 0;
        const tick = () => {
            analyser.getByteFrequencyData(dataArr);
            frameCount++;
            // Only push a bar every ~3 frames (~20Hz) to avoid too-rapid updates
            if (frameCount % 3 === 0) {
                let sum = 0;
                for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
                const avg = sum / dataArr.length;
                const h = Math.max(3, Math.min(28, (avg / 200) * 28));
                setBars(prev => {
                    const next = [...prev, h];
                    // Keep only the last MAX_BARS
                    return next.length > MAX_BARS ? next.slice(next.length - MAX_BARS) : next;
                });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
    }, []);

    const stopVisualizer = () => cancelAnimationFrame(rafRef.current);

    const startRecording = async () => {
        if (Platform.OS !== 'web') return;
        try {
            playBeep();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            chunksRef.current = [];

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;

            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.start(100);
            mediaRef.current = mr;
            setPhase('recording');
            setSeconds(0);
            setBars([]);
            startVisualizer();
        } catch (e) { console.error('mic access denied', e); }
    };

    const pauseRecording = () => {
        if (mediaRef.current && mediaRef.current.state === 'recording') {
            mediaRef.current.pause();
        }
        stopVisualizer();
        setPhase('paused');
    };

    const resumeRecording = () => {
        if (mediaRef.current && mediaRef.current.state === 'paused') {
            mediaRef.current.resume();
        }
        startVisualizer();
        setPhase('recording');
    };

    const cancelRecording = () => {
        stopVisualizer();
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
        streamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close().catch(() => {});
        setPhase('idle');
        setSeconds(0);
        setBars([]);
    };

    const sendVoice = () => {
        stopVisualizer();
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
            const finalSeconds = seconds;
            mediaRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mediaRef.current.onstop = () => {
                streamRef.current?.getTracks().forEach(t => t.stop());
                audioCtxRef.current?.close().catch(() => {});
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = ev => {
                    onSend(ev.target.result, finalSeconds);
                    setPhase('idle');
                    setSeconds(0);
                    setBars([]);
                };
                reader.readAsDataURL(blob);
            };
            mediaRef.current.stop();
        }
    };

    useEffect(() => {
        return () => { cancelAnimationFrame(rafRef.current); clearInterval(timerRef.current); };
    }, []);

    // ── IDLE ──
    if (phase === 'idle') {
        return (
            <TouchableOpacity style={[styles.micBtn, disabled && { opacity: 0.4 }]} onPress={startRecording} disabled={disabled}>
                <Icon name="mic" size={18} color="#C8C4B8" />
            </TouchableOpacity>
        );
    }

    // ── RECORDING / PAUSED ──
    const isPaused = phase === 'paused';
    const displayBars = bars.length > 0 ? bars : Array(10).fill(3);

    return (
        <Animated.View style={[styles.recorderPanel, {
            opacity: slideAnim,
            transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
        }]}>
            {/* Cancel */}
            <TouchableOpacity onPress={cancelRecording} style={styles.recActionBtn}>
                <Icon name="trash" size={16} color="#ED4245" />
            </TouchableOpacity>

            {/* Pause/Resume — uses mic icon for recording state, not play/pause */}
            <TouchableOpacity
                onPress={isPaused ? resumeRecording : pauseRecording}
                style={[styles.recActionBtn, isPaused ? styles.recResumeBtnStyle : styles.recPauseBtnStyle]}
            >
                <Icon name={isPaused ? 'mic' : 'mic-off'} size={16} color={isPaused ? '#C9A84C' : '#C8C4B8'} />
            </TouchableOpacity>

            {/* Pulse dot */}
            {!isPaused && <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />}
            {isPaused && <View style={[styles.recDot, { backgroundColor: '#C9A84C' }]} />}

            {/* Full-width waveform */}
            <View style={styles.waveformStrip}>
                {displayBars.map((h, i) => (
                    <View key={i} style={[styles.waveBar, {
                        height: isPaused ? Math.max(3, h * 0.5) : h,
                        backgroundColor: isPaused ? '#554E40' : '#C9A84C',
                    }]} />
                ))}
            </View>

            {/* Timer */}
            <Text style={styles.recTimer}>{fmt(seconds)}</Text>

            {/* Send */}
            <TouchableOpacity onPress={sendVoice} style={styles.sendVoiceBtn}>
                <Icon name="send" size={14} color="#111" />
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Playback Bubble ─────────────────────────────────────────────────────
export function VoiceMessageBubble({ src, duration = 0, isMine }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(duration);
    const [speedIdx, setSpeedIdx] = useState(1);
    const SPEEDS = [0.5, 1, 1.5, 2];
    const audioRef = useRef(null);
    const rafRef = useRef(null);
    const [loaded, setLoaded] = useState(false);

    // Synthetic waveform bars (deterministic from src)
    const BAR_COUNT = 40;
    const BARS = useRef(Array.from({ length: BAR_COUNT }, (_, i) => {
        const seed = (src?.charCodeAt(i % (src?.length || 1)) || 0) * 0.017;
        return 0.2 + 0.8 * Math.abs(Math.sin(i * 0.65 + seed));
    })).current;

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const audio = new Audio();
        audioRef.current = audio;
        audio.preload = 'auto';
        audio.src = src;
        audio.playbackRate = SPEEDS[speedIdx];

        const onReady = () => {
            setLoaded(true);
            if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration);
        };
        const onEnded = () => {
            setPlaying(false);
            setProgress(0);
            setCurrentTime(0);
            cancelAnimationFrame(rafRef.current);
        };

        audio.addEventListener('canplaythrough', onReady);
        audio.addEventListener('loadedmetadata', onReady);
        audio.addEventListener('ended', onEnded);
        audio.load(); // Force load to avoid stuck state

        return () => {
            audio.pause();
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('ended', onEnded);
            cancelAnimationFrame(rafRef.current);
        };
    }, [src]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
            cancelAnimationFrame(rafRef.current);
        } else {
            audioRef.current.play().catch(() => {});
            setPlaying(true);
            const tick = () => {
                const a = audioRef.current;
                if (a && a.duration && isFinite(a.duration)) {
                    setProgress(a.currentTime / a.duration);
                    setCurrentTime(a.currentTime);
                }
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
        const rect = e.target?.getBoundingClientRect?.();
        if (!rect) return;
        const x = (e.nativeEvent?.pageX || e.pageX || 0) - rect.left;
        let p = x / rect.width;
        if (p < 0) p = 0; if (p > 1) p = 1;
        if (audioRef.current.duration && isFinite(audioRef.current.duration)) {
            audioRef.current.currentTime = p * audioRef.current.duration;
            setProgress(p);
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const accentColor = isMine ? '#C9A84C' : '#A8A090';
    const trackColor = isMine ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.1)';

    return (
        <View style={[styles.voiceBubble, isMine && styles.voiceBubbleMine]}>
            <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: isMine ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.07)' }]}>
                <Icon name={playing ? 'pause' : 'play'} size={16} color={accentColor} />
            </TouchableOpacity>

            <View style={styles.bubbleWaveWrap}>
                <TouchableOpacity style={styles.bubbleBarRow} activeOpacity={1} onPress={handleSeek}>
                    {BARS.map((bar, i) => {
                        const barPos = (i + 1) / BAR_COUNT;
                        const active = barPos <= progress;
                        return (
                            <View key={i} style={{
                                width: 2.5,
                                height: Math.max(3, bar * 22),
                                backgroundColor: active ? accentColor : trackColor,
                                borderRadius: 1.5,
                            }} />
                        );
                    })}
                </TouchableOpacity>
                {/* Scrubber dot */}
                <View style={[styles.bubbleScrubber, {
                    left: `${Math.min(progress * 100, 100)}%`,
                    backgroundColor: accentColor
                }]} />
                <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(201,168,76,0.7)' : '#6E6960' }]}>
                    {playing ? fmt(currentTime) : fmt(totalDuration)}
                </Text>
            </View>

            <TouchableOpacity style={styles.speedBtn} onPress={changeSpeed}>
                <Text style={[styles.speedTxt, { color: accentColor }]}>{SPEEDS[speedIdx]}x</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    micBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },

    // Recorder panel — takes over entire input row
    recorderPanel: {
        flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
        backgroundColor: '#1A1812', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    },
    recActionBtn: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    recPauseBtnStyle: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' },
    recResumeBtnStyle: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: 'rgba(201,168,76,0.3)' },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ED4245' },
    recTimer: { color: '#C8C4B8', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
    sendVoiceBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },

    // Full-width waveform strip
    waveformStrip: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 30,
        overflow: 'hidden', justifyContent: 'flex-end',
    },
    waveBar: { width: 2.5, borderRadius: 1.5 },

    // Playback bubble
    voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', minWidth: 260 },
    voiceBubbleMine: { backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    playBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    bubbleWaveWrap: { flex: 1, position: 'relative', paddingBottom: 16 },
    bubbleBarRow: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 28, cursor: 'pointer' },
    bubbleScrubber: { position: 'absolute', width: 10, height: 10, borderRadius: 5, top: 9, marginLeft: -5, borderWidth: 2, borderColor: '#1A1812' },
    bubbleTime: { position: 'absolute', bottom: -2, left: 0, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
    speedBtn: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    speedTxt: { fontSize: 11, fontWeight: '800' },
});
