/**
 * webrtc.js — Platform-agnostic WebRTC shim.
 * On web: uses native browser WebRTC APIs + custom RTCView with proper muting.
 * On native: uses react-native-webrtc.
 */
import { Platform } from 'react-native';
import React, { useEffect, useRef } from 'react';

let RNWebRTC = {};
if (Platform.OS !== 'web') {
    RNWebRTC = require('react-native-webrtc');
}

export const RTCPeerConnection = Platform.OS === 'web' ? window.RTCPeerConnection : RNWebRTC.RTCPeerConnection;
export const RTCSessionDescription = Platform.OS === 'web' ? window.RTCSessionDescription : RNWebRTC.RTCSessionDescription;
export const RTCIceCandidate = Platform.OS === 'web' ? window.RTCIceCandidate : RNWebRTC.RTCIceCandidate;
export const mediaDevices = Platform.OS === 'web' ? navigator.mediaDevices : RNWebRTC.mediaDevices;

/**
 * RTCView for web: renders a <video> element.
 * Props:
 *   streamURL  — MediaStream object (or URL string for native)
 *   muted      — whether audio is muted (use true for local stream to prevent echo)
 *   mirror     — flip horizontally (use true for front camera / local stream)
 *   objectFit  — 'cover' | 'contain' (default 'cover')
 *   style      — React Native style object (spread to video element)
 */
export const RTCView = Platform.OS === 'web'
    ? ({ streamURL, style, muted = false, objectFit = 'cover', mirror = false }) => {
        const videoRef = useRef(null);

        useEffect(() => {
            const video = videoRef.current;
            if (!video) return;

            const isStream = streamURL && (
                (typeof MediaStream !== 'undefined' && streamURL instanceof MediaStream) || 
                (typeof streamURL === 'object' && typeof streamURL.getTracks === 'function')
            );

            if (isStream) {
                if (video.srcObject !== streamURL) {
                    video.srcObject = streamURL;
                    video.play().catch(err => {
                        console.warn('RTCView: Autoplay play() failed (likely needs user interaction):', err);
                    });
                }
            } else if (typeof streamURL === 'string' && streamURL) {
                if (video.src !== streamURL) {
                    video.src = streamURL;
                    video.play().catch(err => {});
                }
            } else {
                video.srcObject = null;
                video.src = '';
            }
        }, [streamURL]);

        return (
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                style={{
                    backgroundColor: '#000',
                    ...style,
                    objectFit,
                    transform: mirror ? 'scaleX(-1)' : 'none',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                }}
            />
        );
    }
    : RNWebRTC.RTCView;
