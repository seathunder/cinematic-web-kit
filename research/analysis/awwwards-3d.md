# Repository Analysis: awwwards-3d

## 1. Components
- **Framework:** Vanilla HTML/JS (No framework, served directly)
- **Build tool:** None (Uses ESM imports via `importmap` directly in HTML, from CDNs like unpkg and esm.sh)
- **Rendering engine:** WebGL via Three.js (r170)
- **Animation system:** GSAP (v3.12.5) for timelines and easing
- **Scroll system:** Lenis (v1.1.0) with GSAP ScrollTrigger
- **3D system:** Three.js directly
- **State management:** Custom lightweight object (`state`) with a `damp()` function for lerping values per frame.
- **Asset pipeline:** Pre-built GLB models loaded via `GLTFLoader` (in other templates), synthetic PMREM environment setup without external HDRs in minimal template.
- **Shader architecture:** Custom ShaderPasses (Vignette, Film grain) used within `EffectComposer`.
- **Camera architecture:** PerspectiveCamera managed via lerping target states based on scroll and mouse position (parallax).
- **Interaction architecture:** Mouse move updates target state variables which are lerped in the render loop.
- **DOM ↔ Canvas communication:** Overlay DOM elements via `z-index: 1`, pointer-events disabled on canvas, scroll position piped from Lenis to GSAP ScrollTrigger to update 3D state targets.
- **Performance techniques:** 
  - `powerPreference: 'high-performance'`
  - Synthetic environment (`RoomEnvironment`) for lighting/reflections without heavy assets.
  - Pixel ratio capped at 2 (`Math.min(window.devicePixelRatio, 2)`).
  - Visibility pause (stops `requestAnimationFrame` when document is hidden).
  - Shader pre-warming (`renderer.compile(scene, camera)`) to avoid first-frame hitches.
- **Responsive strategy:** Event listener for `resize` coalesced via `requestAnimationFrame`.
- **Mobile fallback strategy:** WebGL feature detection; adds `no-webgl` class to body to show fallback text if WebGL fails.
- **Loading/preloading strategy:** Custom HTML/CSS preloader overlay with progress counter, fake loading in minimal template, real loading in others.

## 2. Architecture Category
**THREEJS_REALTIME** and **SCROLL_DRIVEN_GSAP** (It represents a highly polished boilerplate for cinematic scroll-driven WebGL experiences).

## 3. Reusable Patterns
- **Lerp State Container:** A clean pattern where an object holds `{ current, target, ease }` for various values (camera position, rotation, etc.) and a single `damp()` function updates them smoothly in the render loop.
- **Visibility Pause:** Listening to `visibilitychange` to stop the rAF loop and save battery/CPU when the tab is hidden.
- **Shader Pre-warming:** Calling `renderer.compile(scene, camera)` before dismissing the preloader.
- **Lenis + ScrollTrigger Bridge:** Binding Lenis scroll updates directly to GSAP's ticker.

## 4. Code Map
- `docs/templates/*.html`: Core implementations of different setups (minimal, glass-product, room-walkthrough, coin-scroll).
- `assets/models/*.glb`: Core 3D assets.
- `scripts/`: Utility scripts (Python) for project initialization and exporting.
- `references/*.md`: Detailed markdown documentation on shaders, patterns, pipelines, etc.

## 5. License & Assets
- **License:** Provided `LICENSE` file.
- **Notable Assets:** Blob, coin, glass orb, and room GLB models.

## 6. Code Quality
**Rating: S**
Extremely clean, modern ESM approach without build step bloat. Implements best practices for performance (visibility pause, shader pre-compile, pixel ratio capping).
