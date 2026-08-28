# Pattern Index

## Scroll-controlled 3D camera
- **orbit**: Lerps camera position in a custom `requestAnimationFrame` loop driven by native scroll progress.
- **threejs-scroll-scene**: Uses GSAP `ScrollTrigger` scrubbing a timeline to tween the camera through an array of `Waypoint` objects.

## DOM / WebGL Synchronization
- **awwwards-3d**: Uses a lightweight `lerp` state container and `damp()` function that natively syncs Lenis scroll/pointer position into the WebGL requestAnimationFrame loop.
- **lattice-drift**: Pushes high-frequency animation states (scroll progress, velocity) to an external mutable state module and to CSS Custom Properties to avoid React re-renders while updating Vanilla Three.js.

## Procedural Shader Worlds
- **orbit**: Uses custom curl-noise shaders and particle galaxies managed directly in raw Three.js.
- **Webgl-Data-Globe**: Utilizes a centralized "Scene Director" pattern and custom `BufferGeometry` particle systems with `vite-plugin-glsl` to minimize heap allocations.

## Video & Sequence Scrubbing
- **motion-primitives-website**: Uses native container scroll intersections (`getBoundingClientRect`) and `requestAnimationFrame` to scrub video `currentTime`.

## Reduced Motion / Accessibility Fallbacks
- **orbit**: Integrates `prefers-reduced-motion` deeply into the rendering loop, falling back to a static frame.
- **threejs-scroll-scene**: Features completely distinct logic paths for standard motion (GSAP scrubbing) vs. reduced motion (IntersectionObserver snapping to waypoints).

## Dynamic Object Manipulation
- **motion-primitives-website**: The `Spline Recolor Pattern` dynamically traverses and recolors `@splinetool` geometries based on string names.
