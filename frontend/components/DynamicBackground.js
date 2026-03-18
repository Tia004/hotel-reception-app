import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * DynamicBackground — v2.9.0
 * True DOM canvas with mouse-reactive particles.
 * Uses document.createElement to bypass RN's JSX pipeline.
 */
export default function DynamicBackground() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;

        // Create canvas imperatively (RN JSX doesn't pass DOM refs through)
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 1;
        `;

        const container = containerRef.current;
        if (!container) return;
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        let W = window.innerWidth;
        let H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;

        const mouse = { x: W / 2, y: H / 2 };
        const COUNT = 80;
        const MAX_DIST = 120;
        const MOUSE_RADIUS = 160;

        const makeP = () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() * 1.6 + 0.6,
            gold: Math.random() > 0.38,
            speed: Math.random() * 0.3 + 0.7, // breathing speed multiplier
        });

        let particles = Array.from({ length: COUNT }, makeP);
        let raf;
        let t = 0;

        const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
        const onTouch = (e) => {
            if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
        };
        const onResize = () => {
            W = window.innerWidth; H = window.innerHeight;
            canvas.width = W; canvas.height = H;
        };
        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('touchmove', onTouch, { passive: true });
        window.addEventListener('resize', onResize);

        const draw = () => {
            t += 0.003;
            ctx.clearRect(0, 0, W, H);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                // Breathing: oscillate speed
                const breathe = Math.sin(t * p.speed + i) * 0.08;

                // Mouse attraction
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < MOUSE_RADIUS) {
                    const f = ((MOUSE_RADIUS - d) / MOUSE_RADIUS) * 0.012;
                    p.vx += (dx / d) * f;
                    p.vy += (dy / d) * f;
                }

                // Friction + speed cap
                p.vx *= 0.978;
                p.vy *= 0.978;
                const spd = Math.hypot(p.vx, p.vy);
                if (spd > 1.0) { p.vx *= 1.0 / spd; p.vy *= 1.0 / spd; }

                p.x += p.vx;
                p.y += p.vy;

                // Wrap
                if (p.x < -10) p.x = W + 10;
                if (p.x > W + 10) p.x = -10;
                if (p.y < -10) p.y = H + 10;
                if (p.y > H + 10) p.y = -10;

                // Draw particle with breathing opacity
                const opacity = 0.4 + breathe;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + Math.abs(breathe) * 0.8, 0, Math.PI * 2);
                ctx.fillStyle = p.gold
                    ? `rgba(201,168,76,${opacity})`
                    : `rgba(107,127,196,${opacity * 0.85})`;
                ctx.fill();

                // Connection lines
                for (let j = i + 1; j < particles.length; j++) {
                    const q = particles[j];
                    const ex = p.x - q.x;
                    const ey = p.y - q.y;
                    const dd = Math.sqrt(ex * ex + ey * ey);
                    if (dd < MAX_DIST) {
                        const alpha = (1 - dd / MAX_DIST) * 0.16;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = p.gold
                            ? `rgba(201,168,76,${alpha})`
                            : `rgba(107,127,196,${alpha})`;
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                    }
                }
            }
            raf = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onTouch);
            window.removeEventListener('resize', onResize);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, []);

    if (Platform.OS !== 'web') {
        return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090806' }]} />;
    }

    const css = `
    @keyframes bgShift {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    @keyframes auraFloat1 {
        0%   { transform: translate(0,0) scale(1); opacity: 0.14; }
        50%  { transform: translate(55px,-35px) scale(1.2); opacity: 0.24; }
        100% { transform: translate(0,0) scale(1); opacity: 0.14; }
    }
    @keyframes auraFloat2 {
        0%   { transform: translate(0,0) scale(1.1); opacity: 0.09; }
        50%  { transform: translate(-65px,45px) scale(0.92); opacity: 0.19; }
        100% { transform: translate(0,0) scale(1.1); opacity: 0.09; }
    }
    .dbg-root {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        overflow: hidden; pointer-events: none;
    }
    .dbg-gradient {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(-45deg, #090806, #1a150c, #0d0f18, #120e08, #090806);
        background-size: 500% 500%;
        animation: bgShift 20s ease-in-out infinite;
    }
    .dbg-aura1 {
        position: absolute; top: -15%; left: -5%; width: 55%; height: 55%;
        background: radial-gradient(circle, rgba(201,168,76,0.11) 0%, transparent 70%);
        border-radius: 50%; filter: blur(50px);
        animation: auraFloat1 16s ease-in-out infinite;
    }
    .dbg-aura2 {
        position: absolute; bottom: -10%; right: -5%; width: 60%; height: 60%;
        background: radial-gradient(circle, rgba(107,127,196,0.09) 0%, transparent 70%);
        border-radius: 50%; filter: blur(60px);
        animation: auraFloat2 22s ease-in-out infinite;
    }
    `;

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <style dangerouslySetInnerHTML={{ __html: css }} />
            <div className="dbg-root">
                <div className="dbg-gradient" />
                <div className="dbg-aura1" />
                <div className="dbg-aura2" />
                {/* Canvas injected imperatively in useEffect */}
                <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            </div>
        </View>
    );
}
