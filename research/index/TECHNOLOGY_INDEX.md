# Technology Index

## Three.js (Vanilla)
- **WHAT IT DOES:** Core WebGL rendering engine for creating 3D scenes, cameras, and meshes natively in JavaScript.
- **WHERE IT IS USED:** For environments where React overhead is unwanted, or maximum custom shader control is needed.
- **DEMONSTRATED IN:** `awwwards-3d`, `orbit`, `lattice-drift`, `threejs-scroll-scene`
- **CLEANEST IMPLEMENTATION:** `orbit` (No dependencies, highly performant custom RAF loop).

## React Three Fiber (R3F)
- **WHAT IT DOES:** A React renderer for Three.js, allowing declarative 3D scene construction with JSX.
- **WHERE IT IS USED:** In React/Next.js architectures needing tight integration between DOM state and WebGL.
- **DEMONSTRATED IN:** `Webgl-Data-Globe`, `motion-primitives-website`
- **CLEANEST IMPLEMENTATION:** `Webgl-Data-Globe` (Highly optimized to avoid per-frame allocations).

## GSAP & ScrollTrigger
- **WHAT IT DOES:** Industry-standard animation engine and scroll-timeline scrubber.
- **WHERE IT IS USED:** Complex sequenced animations and pinning sections to the scrollbar.
- **DEMONSTRATED IN:** `awwwards-3d`, `lattice-drift`, `threejs-scroll-scene`, `Webgl-Data-Globe`, `motion-primitives-website`
- **CLEANEST IMPLEMENTATION:** `threejs-scroll-scene` (Clean `Waypoint` camera path scrubbing).

## Lenis
- **WHAT IT DOES:** Smooth scrolling library that hijacks native scroll to provide a buttery feeling.
- **WHERE IT IS USED:** Any cinematic site that requires consistent scroll momentum across devices.
- **DEMONSTRATED IN:** `awwwards-3d`, `motion-primitives-website`
- **CLEANEST IMPLEMENTATION:** `awwwards-3d` (Direct integration with WebGL render loop).

## Zustand
- **WHAT IT DOES:** Small, fast, scalable barebones state-management solution for React.
- **WHERE IT IS USED:** To manage global state that needs to be accessed outside of the standard React component hierarchy (e.g., inside R3F hooks).
- **DEMONSTRATED IN:** `Webgl-Data-Globe`
- **CLEANEST IMPLEMENTATION:** `Webgl-Data-Globe` (Used to coordinate the "Scene Director").

## Framer Motion
- **WHAT IT DOES:** Declarative animation library for React DOM components.
- **WHERE IT IS USED:** For UI transitions, spring-based interactions, and layout animations.
- **DEMONSTRATED IN:** `motion-primitives-website`
- **CLEANEST IMPLEMENTATION:** `motion-primitives-website`
