# Master Index

| Repo | Architecture | Framework | Renderer | Scroll | Animation | 3D | Best For | Rating |
|------|--------------|-----------|----------|--------|-----------|----|----------|--------|
| **awwwards-3d** | THREEJS_REALTIME, SCROLL_DRIVEN_GSAP | Vanilla HTML/JS | Three.js | Lenis | GSAP | Three.js | Lightweight state lerping & DOM-WebGL sync | S |
| **orbit** | PROCEDURAL_GLSL_WORLD, THREEJS_CAMERA_RAIL | Vanilla JS | Three.js | Native + IntersectionObserver | Custom Lerp Loop | Three.js | Accessible scroll-driven shaders without frameworks | S |
| **Webgl-Data-Globe** | DATA_DRIVEN_3D_WORLD, R3F_REALTIME | React 18 / Zustand | R3F | GSAP ScrollTrigger | GSAP / React Spring | R3F | Modular, highly-optimized data visualizations | S |
| **lattice-drift** | HYBRID_DOM_3D, SCROLL_DRIVEN_GSAP | React 19 / Vite | Three.js | Native + CSS Vars | GSAP | Three.js | Hybrid rendering without R3F overhead | A |
| **motion-primitives-website** | R3F_REALTIME, VIDEO_SCRUB, DOM_GSAP_CINEMATIC | Next.js 14 | R3F / Framer | Native / Lenis | Framer Motion / GSAP | R3F | Spline integration and video scrubbing | A |
| **threejs-scroll-scene** | THREEJS_CAMERA_RAIL | Vanilla TS / Vite | Three.js | GSAP ScrollTrigger | GSAP | Three.js | Simple timeline scrubbing via GSAP | A |

## Rating Explanations
- **S-Tier:** Code is highly modular, deeply accessible (e.g., handles `prefers-reduced-motion` cleanly), minimizes dependency bloat, and provides excellent patterns for synchronization between DOM and Canvas.
- **A-Tier:** Excellent reference code utilizing standard tools (Next.js, R3F, Framer Motion, GSAP) effectively, providing great component-level copy-paste patterns but perhaps relying heavier on library abstractions.
