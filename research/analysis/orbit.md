# Orbit - Repository Analysis

## 1. Technical Stack & Architecture
- **Framework**: Vanilla JavaScript (HTML/CSS/JS)
- **Build Tool**: None (ESM imports via importmap)
- **Rendering Engine**: Three.js (raw)
- **Animation System**: Custom `requestAnimationFrame` loop with lerp-based easing.
- **Scroll System**: Native scroll listeners mapped to a 0-1 progress value, combined with `IntersectionObserver` for section tracking and color grading.
- **3D System**: Three.js setup with custom curl-noise shaders, particle galaxy, and post-processing (Bloom, MSAA, Vignette/Color Grade).
- **State Management**: Local component state (closures managing `progress`, `pointer`, `hue`).
- **Asset Pipeline**: Static assets over HTTP. Colors dynamically converted to sRGB using an OKLCH utility.

## 2. Architecture Classification
- **Classification**: `PROCEDURAL_GLSL_WORLD` / `THREEJS_CAMERA_RAIL`

## 3. Reusable Patterns
- **Reduced Motion Fallback**: Integrates `prefers-reduced-motion` at the core level, falling back to a static frame.
- **Scroll-Driven Camera Lerping**: Native scroll position drives a target Z coordinate, which the camera lerps towards, avoiding scrolljacking.
- **IntersectionObserver Color Grading**: Changing ambient or background colors dynamically as sections scroll into view.

## 4. Code Map
- `index.html`: DOM structure, accessible text content, and Three.js importmap.
- `src/app.js`: Application entry point.
- `src/scene.js`: Three.js initialization, render loop, and post-processing pipeline.
- `src/scroll.js`: Scroll event bindings, progress calculation, and IntersectionObserver logic.
- `src/shaders.js`: Custom GLSL vertex and fragment shaders for the central core.
- `src/config.js`: Centralized configuration (colors, camera, particles, bloom).

## 5. License and Assets
- **License**: MIT
- **Assets**: Minimal SVG icons. Uses programmatic shaders and particles for visuals instead of external textures.

## 6. Code Quality
- **Rating**: S
- **Notes**: Excellent implementation of an accessible, performant 3D scroll experience without heavy frameworks. Pauses rendering off-screen and respects user motion preferences.
