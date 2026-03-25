/**
 * ImageLightbox.js — v4.1.5
 * Full-screen image viewer with zoom (+/-), arrow navigation, click-outside to close.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, Animated, Platform, Dimensions } from 'react-native';
import { Icon } from './Icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function ImageLightbox({ images = [], initialIndex = 0, visible, onClose }) {
    const [index, setIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);

    useEffect(() => { setIndex(initialIndex); setZoom(1); }, [initialIndex, visible]);

    if (!images.length) return null;
    const src = images[index];
    const canPrev = index > 0;
    const canNext = index < images.length - 1;

    const zoomIn = () => setZoom(z => Math.min(z + 0.5, 4));
    const zoomOut = () => setZoom(z => Math.max(z - 0.5, 0.5));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>

                {/* Close button */}
                <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                    <Icon name="x" size={20} color="#C8C4B8" />
                </TouchableOpacity>

                {/* Image counter */}
                {images.length > 1 && (
                    <View style={styles.counter}>
                        <Text style={styles.counterTxt}>{index + 1} / {images.length}</Text>
                    </View>
                )}

                {/* Image */}
                <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.imageWrap}>
                    <Image
                        source={{ uri: src }}
                        style={[styles.image, { transform: [{ scale: zoom }] }]}
                        resizeMode="contain"
                    />
                </TouchableOpacity>

                {/* Prev / Next arrows */}
                {canPrev && (
                    <TouchableOpacity style={[styles.arrow, styles.arrowLeft]} onPress={() => { setIndex(i => i - 1); setZoom(1); }} activeOpacity={0.8}>
                        <Icon name="chevron-left" size={26} color="#C8C4B8" />
                    </TouchableOpacity>
                )}
                {canNext && (
                    <TouchableOpacity style={[styles.arrow, styles.arrowRight]} onPress={() => { setIndex(i => i + 1); setZoom(1); }} activeOpacity={0.8}>
                        <Icon name="chevron-right" size={26} color="#C8C4B8" />
                    </TouchableOpacity>
                )}

                {/* Zoom controls */}
                <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.zoomBar}>
                    <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} disabled={zoom <= 0.5} activeOpacity={0.8}>
                        <Icon name="zoom-out" size={18} color={zoom <= 0.5 ? '#3A3630' : '#C8C4B8'} />
                    </TouchableOpacity>
                    <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
                    <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} disabled={zoom >= 4} activeOpacity={0.8}>
                        <Icon name="zoom-in" size={18} color={zoom >= 4 ? '#3A3630' : '#C8C4B8'} />
                    </TouchableOpacity>
                </TouchableOpacity>

            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
    closeBtn: {
        position: 'absolute', top: 20, right: 20, zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20,
        width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    },
    counter: { position: 'absolute', top: 24, left: '50%', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    counterTxt: { color: '#C8C4B8', fontSize: 13 },
    imageWrap: { width: SCREEN_W * 0.85, height: SCREEN_H * 0.7, justifyContent: 'center', alignItems: 'center' },
    image: { width: '100%', height: '100%' },
    arrow: {
        position: 'absolute', top: '50%', marginTop: -24,
        backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24,
        width: 48, height: 48, justifyContent: 'center', alignItems: 'center',
    },
    arrowLeft: { left: 16 },
    arrowRight: { right: 16 },
    zoomBar: {
        position: 'absolute', bottom: 32,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: 'rgba(26,24,18,0.9)', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
    },
    zoomBtn: { padding: 4 },
    zoomLabel: { color: '#C9A84C', fontSize: 13, fontWeight: '700', minWidth: 40, textAlign: 'center' },
});
