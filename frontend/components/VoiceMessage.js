/**
 * VoiceMessage.js — v2.7.1
 * Complete overhaul: Pause/Resume recording, Preview before send,
 * Slide-in animation, hides text input during recording,
 * WhatsApp-style waveform with scrubber dot during playback.
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

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * States: idle → recording → paused → preview → idle
 * - idle: shows mic button
 * - recording: shows live waveform with pause/cancel/send buttons, text input hidden
 * - paused: shows "Paused" with resume/cancel/send
 * - preview: shows playback of the recorded audio before sending
 */
export function VoiceRecorderButton({ onSend, disabled }) {
    // 'idle' | 'recording' | 'paused' | 'preview'
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

    // Live waveform
    const [waveform, setWaveform] = useState(Array(30).fill(3));
    const rafRef = useRef(null);

    // Preview playback
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const [previewProgress, setPreviewProgress] = useState(0);
    const previewAudioRef = useRef(null);
    const previewRafRef = useRef(null);

    // Waveform snapshot for preview
    const waveSnapshotRef = useRef([]);

    // Animate slide in/out
    useEffect(() => {
        const isActive = phase !== 'idle';
        Animated.spring(slideAnim, { toValue: isActive ? 1 : 0, useNativeDriver: false, damping: 18, stiffness: 160 }).start();
    }, [phase]);

    // Pulse animation while recording
    useEffect(() => {
        if (phase === 'recording') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            ).start();
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

    // Live waveform analyser
    const startVisualizer = useCallback(() => {
        if (!analyserRef.current) return;
        const analyser = analyserRef.current;
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
            analyser.getByteFrequencyData(dataArr);
            let sum = 0;
            for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
            const avg = sum / dataArr.length;
            const h = Math.max(3, Math.min(28, (avg / 256) * 40));
            setWaveform(prev => {
                const next = [...prev.slice(1), h];
                waveSnapshotRef.current = next;
                return next;
            });
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
    }, []);

    const stopVisualizer = () => {
        cancelAnimationFrame(rafRef.current);
    };

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
            setWaveform(Array(30).fill(3));
            waveSnapshotRef.current = Array(30).fill(3);
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
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
            mediaRef.current.stop();
        }
        streamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close().catch(() => {});
        setPhase('idle');
        setSeconds(0);
        setWaveform(Array(30).fill(3));
        setPreviewUrl(null);
        // Clean preview audio
        if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    };

    const goToPreview = () => {
        stopVisualizer();
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
            mediaRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mediaRef.current.onstop = () => {
                streamRef.current?.getTracks().forEach(t => t.stop());
                audioCtxRef.current?.close().catch(() => {});
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
                setPhase('preview');
                setPreviewProgress(0);
                setPreviewPlaying(false);
            };
            mediaRef.current.stop();
        }
    };

    const sendVoice = () => {
        // If still recording/paused, finalize first  
        if (phase === 'recording' || phase === 'paused') {
            stopVisualizer();
            if (mediaRef.current && mediaRef.current.state !== 'inactive') {
                mediaRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
                mediaRef.current.onstop = () => {
                    streamRef.current?.getTracks().forEach(t => t.stop());
                    audioCtxRef.current?.close().catch(() => {});
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = ev => {
                        onSend(ev.target.result, seconds);
                        setPhase('idle');
                        setSeconds(0);
                        setPreviewUrl(null);
                    };
                    reader.readAsDataURL(blob);
                };
                mediaRef.current.stop();
            }
        } else if (phase === 'preview' && previewUrl) {
            // Convert blob url to base64
            if (previewAudioRef.current) { previewAudioRef.current.pause(); }
            cancelAnimationFrame(previewRafRef.current);
            fetch(previewUrl).then(r => r.blob()).then(blob => {
                const reader = new FileReader();
                reader.onload = ev => {
                    onSend(ev.target.result, seconds);
                    URL.revokeObjectURL(previewUrl);
                    setPhase('idle');
                    setSeconds(0);
                    setPreviewUrl(null);
                    setPreviewProgress(0);
                };
                reader.readAsDataURL(blob);
            });
        }
    };

    // Preview playback
    const togglePreviewPlay = () => {
        if (!previewUrl) return;
        if (!previewAudioRef.current) {
            const a = new Audio(previewUrl);
            previewAudioRef.current = a;
            a.onended = () => { setPreviewPlaying(false); setPreviewProgress(0); cancelAnimationFrame(previewRafRef.current); };
        }
        const a = previewAudioRef.current;
        if (previewPlaying) {
            a.pause();
            setPreviewPlaying(false);
            cancelAnimationFrame(previewRafRef.current);
        } else {
            a.play();
            setPreviewPlaying(true);
            const tick = () => {
                if (a.duration) setPreviewProgress(a.currentTime / a.duration);
                previewRafRef.current = requestAnimationFrame(tick);
            };
            tick();
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            cancelAnimationFrame(previewRafRef.current);
            clearInterval(timerRef.current);
            if (previewAudioRef.current) previewAudioRef.current.pause();
        };
    }, []);

    // ── IDLE: just the mic button ──
    if (phase === 'idle') {
        return (
            <TouchableOpacity style={[styles.micBtn, disabled && { opacity: 0.4 }]} onPress={startRecording} disabled={disabled}>
                <Icon name="mic" size={18} color="#C8C4B8" />
            </TouchableOpacity>
        );
    }

    // ── RECORDING / PAUSED ──
    if (phase === 'recording' || phase === 'paused') {
        return (
            <Animated.View style={[styles.recorderPanel, { 
                opacity: slideAnim,
                transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
            }]}>
                {/* Cancel */}
                <TouchableOpacity onPress={cancelRecording} style={styles.recActionBtn}>
                    <Icon name="trash" size={16} color="#ED4245" />
                </TouchableOpacity>

                {/* Pulse dot + timer */}
                <View style={styles.recInfo}>
                    {phase === 'recording' ? (
                        <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
                    ) : (
                        <View style={[styles.recDot, { backgroundColor: '#C9A84C' }]} />
                    )}
                    <Text style={styles.recTimer}>{fmt(seconds)}</Text>
                    {phase === 'paused' && <Text style={styles.pausedLabel}>IN PAUSA</Text>}
                </View>

                {/* Live waveform */}
                <View style={styles.liveWaveform}>
                    {waveform.map((v, i) => (
                        <View key={i} style={[styles.liveBar, { 
                            height: phase === 'paused' ? 3 : v,
                            backgroundColor: phase === 'paused' ? '#554E40' : '#ED4245' 
                        }]} />
                    ))}
                </View>

                {/* Pause / Resume */}
                <TouchableOpacity 
                    onPress={phase === 'recording' ? pauseRecording : resumeRecording} 
                    style={styles.recActionBtn}
                >
                    <Icon name={phase === 'recording' ? 'pause' : 'play'} size={16} color="#C8C4B8" />
                </TouchableOpacity>

                {/* Preview (stop & listen) */}
                <TouchableOpacity onPress={goToPreview} style={[styles.recActionBtn, { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: 'rgba(201,168,76,0.3)' }]}>
                    <Icon name="headphones" size={16} color="#C9A84C" />
                </TouchableOpacity>

                {/* Send directly */}
                <TouchableOpacity onPress={sendVoice} style={styles.sendVoiceBtn}>
                    <Icon name="send" size={14} color="#111" />
                </TouchableOpacity>
            </Animated.View>
        );
    }

    // ── PREVIEW ──
    if (phase === 'preview') {
        const snapshot = waveSnapshotRef.current.length > 0 ? waveSnapshotRef.current : Array(30).fill(8);
        return (
            <Animated.View style={[styles.recorderPanel, styles.previewPanel, { 
                opacity: slideAnim,
                transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
            }]}>
                {/* Cancel / discard */}
                <TouchableOpacity onPress={cancelRecording} style={styles.recActionBtn}>
                    <Icon name="trash" size={16} color="#ED4245" />
                </TouchableOpacity>

                {/* Play/pause preview */}
                <TouchableOpacity onPress={togglePreviewPlay} style={[styles.recActionBtn, { backgroundColor: 'rgba(201,168,76,0.2)', borderColor: 'rgba(201,168,76,0.3)' }]}>
                    <Icon name={previewPlaying ? 'pause' : 'play'} size={16} color="#C9A84C" />
                </TouchableOpacity>

                {/* Waveform + scrubber */}
                <View style={styles.previewWaveWrap}>
                    <View style={styles.previewWaveform}>
                        {snapshot.map((v, i) => {
                            const barProgress = (i + 1) / snapshot.length;
                            const active = barProgress <= previewProgress;
                            return (
                                <View key={i} style={[styles.previewBar, { 
                                    height: Math.max(3, v * 0.8),
                                    backgroundColor: active ? '#C9A84C' : 'rgba(201,168,76,0.25)'
                                }]} />
                            );
                        })}
                    </View>
                    {/* Scrubber dot */}
                    <View style={[styles.previewScrubber, { left: `${previewProgress * 100}%` }]} />
                </View>

                <Text style={styles.recTimer}>{fmt(seconds)}</Text>

                {/* Send */}
                <TouchableOpacity onPress={sendVoice} style={styles.sendVoiceBtn}>
                    <Icon name="send" size={14} color="#111" />
                </TouchableOpacity>
            </Animated.View>
        );
    }

    return null;
}

// ─── Playback bubble (inside chat messages) ──────────────────────────────
export function VoiceMessageBubble({ src, duration = 0, isMine }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(duration);
    const [speedIdx, setSpeedIdx] = useState(1); // default 1x
    const SPEEDS = [0.5, 1, 1.5, 2];
    const audioRef = useRef(null);
    const rafRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const waveformRef = useRef(null);

    // Generate synthetic waveform based on src hash
    const BARS = useRef(Array.from({ length: 32 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + (src?.length || 0) * 0.1)))).current;

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.playbackRate = SPEEDS[speedIdx];
        audio.oncanplaythrough = () => { setLoaded(true); if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration); };
        audio.onloadedmetadata = () => { if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration); };
        audio.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); cancelAnimationFrame(rafRef.current); };
        return () => { audio.pause(); cancelAnimationFrame(rafRef.current); };
    }, [src]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
            cancelAnimationFrame(rafRef.current);
        } else {
            audioRef.current.play();
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
        const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : null;
        if (!rect) return;
        const x = (e.nativeEvent?.pageX || e.pageX) - rect.left;
        let p = x / rect.width;
        if (p < 0) p = 0; if (p > 1) p = 1;
        audioRef.current.currentTime = p * audioRef.current.duration;
        setProgress(p);
        setCurrentTime(audioRef.current.currentTime);
    };

    const accentColor = isMine ? '#C9A84C' : '#A8A090';
    const trackColor = isMine ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.12)';

    return (
        <View style={[styles.voiceBubble, isMine && styles.voiceBubbleMine]}>
            {/* Play/Pause button */}
            <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: isMine ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.07)' }]}>
                <Icon name={playing ? 'pause' : 'play'} size={16} color={accentColor} />
            </TouchableOpacity>

            {/* Waveform + scrubber */}
            <View style={styles.waveformContainer}>
                <TouchableOpacity 
                    ref={waveformRef}
                    style={styles.waveformBars} 
                    activeOpacity={1} 
                    onPress={handleSeek}
                >
                    {BARS.map((bar, i) => {
                        const barPos = (i + 1) / BARS.length;
                        const active = barPos <= progress;
                        return (
                            <View key={i} style={{
                                width: 2.5,
                                height: Math.max(3, bar * 22),
                                backgroundColor: active ? accentColor : trackColor,
                                borderRadius: 1.5,
                                transition: 'background-color 0.1s',
                            }} />
                        );
                    })}
                </TouchableOpacity>
                {/* Scrubber dot */}
                <View style={[styles.bubbleScrubber, { left: `${Math.min(progress * 100, 100)}%`, backgroundColor: accentColor }]} />
                {/* Time label */}
                <Text style={[styles.timeLabel, { color: isMine ? '#C9A84C' : '#6E6960' }]}>
                    {playing ? fmt(currentTime) : fmt(totalDuration)}
                </Text>
            </View>

            {/* Speed button */}
            <TouchableOpacity style={styles.speedBtn} onPress={changeSpeed}>
                <Text style={[styles.speedTxt, { color: accentColor }]}>{SPEEDS[speedIdx]}x</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    // ── Mic idle button
    micBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1A12', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },

    // ── Recorder panel (replaces entire input area)
    recorderPanel: { 
        flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, 
        backgroundColor: '#1A1812', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, 
        borderWidth: 1, borderColor: 'rgba(237,66,69,0.25)' 
    },
    previewPanel: { borderColor: 'rgba(201,168,76,0.3)' },
    recActionBtn: { 
        width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.05)', 
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' 
    },
    recInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ED4245' },
    recTimer: { color: '#C8C4B8', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    pausedLabel: { color: '#C9A84C', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
    sendVoiceBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },

    // ── Live waveform
    liveWaveform: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 28, flex: 1, justifyContent: 'center' },
    liveBar: { width: 2.5, borderRadius: 1.5 },

    // ── Preview waveform
    previewWaveWrap: { flex: 1, height: 32, justifyContent: 'center', position: 'relative' },
    previewWaveform: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 28, justifyContent: 'center' },
    previewBar: { width: 2.5, borderRadius: 1.5 },
    previewScrubber: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#C9A84C', top: '50%', marginTop: -6, marginLeft: -6, borderWidth: 2, borderColor: '#1A1812' },

    // ── Playback Bubble
    voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', minWidth: 240 },
    voiceBubbleMine: { backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
    playBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    waveformContainer: { flex: 1, position: 'relative', paddingBottom: 14 },
    waveformBars: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 28, cursor: 'pointer' },
    bubbleScrubber: { position: 'absolute', width: 10, height: 10, borderRadius: 5, top: 9, marginLeft: -5, borderWidth: 2, borderColor: '#1A1812' },
    timeLabel: { position: 'absolute', bottom: -2, left: 0, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
    speedBtn: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    speedTxt: { fontSize: 11, fontWeight: '800' },
});
