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

export const RTCView = Platform.OS === 'web' ? ({ streamURL, style, zOrder, objectFit, mirror }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && streamURL) {
            videoRef.current.srcObject = streamURL;
        }
    }, [streamURL]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={zOrder === 1} // if local stream, mute it
            style={{
                ...style,
                objectFit: objectFit || 'cover',
                transform: mirror ? 'scaleX(-1)' : 'none'
            }}
        />
    );
} : RNWebRTC.RTCView;
