# Claude Code Brief: Cinematic Web Experiences

**CONTEXT:** You have access to a local corpus of reference implementations for building cinematic, Apple-style, scroll-driven, interactive, and 3D web experiences. These references are located in `c:\Users\HP\Desktop\cinematic-web-references\repos`.

Your goal is to use these architectures as reference material when building new experiences.

## Architectural Families

1. **THREEJS_CAMERA_RAIL** (`threejs-scroll-scene`, `orbit`)
   - **What it is:** Moving a Three.js camera along a predefined path or interpolating between target coordinates based on scroll progress.
   - **When to use:** For guided narrative experiences, "fly-through" websites, and product showcases where the user's scroll dictates the camera's journey through a 3D scene.
   - **Strongest Reference:** `threejs-scroll-scene` (uses GSAP `ScrollTrigger` and a `Waypoint` array).

2. **PROCEDURAL_GLSL_WORLD** (`orbit`)
   - **What it is:** Using raw WebGL / Three.js shaders (vertex and fragment) to generate the environment (e.g., curl noise, particle galaxies) rather than loading heavy `.glb` or texture files.
   - **When to use:** When extreme performance and small bundle sizes are required, or when visuals need to be highly mathematical and abstract.
   - **Strongest Reference:** `orbit`.

3. **HYBRID_DOM_3D** (`lattice-drift`, `awwwards-3d`)
   - **What it is:** Orchestrating Vanilla Three.js and HTML DOM elements together seamlessly, often syncing their states using an external state manager or CSS variables, bypassing heavy framework reconciliation loops.
   - **When to use:** When you need the UI advantages of React/Vue but the raw performance and flexibility of Vanilla Three.js, without the overhead of React Three Fiber.
   - **Strongest Reference:** `lattice-drift`.

4. **DATA_DRIVEN_3D_WORLD / R3F_REALTIME** (`Webgl-Data-Globe`, `motion-primitives-website`)
   - **What it is:** Using React Three Fiber (R3F) to declaratively build 3D scenes that react to complex React state (like external data sources).
   - **When to use:** When the 3D scene relies heavily on dynamic data, complex UI overlays, or when the team is deeply entrenched in the React ecosystem.
   - **Strongest Reference:** `Webgl-Data-Globe` (Highly optimized to prevent per-frame allocations).

## Implementation Guidelines

### Performance Control
- **Decouple Scroll from Render:** Never trigger WebGL renders directly inside a native `scroll` event. Instead, use the scroll event to update a `target` variable, and use a single `requestAnimationFrame` loop to `lerp` the `current` state towards the `target` and render.
- **Avoid React Re-renders on Scroll:** In React architectures, do not store high-frequency values (like scroll progress X/Y) in `useState`. Push them to CSS Custom Properties (`document.documentElement.style.setProperty('--scroll', val)`) or use a Vanilla JS mutable state object.
- **Manage Allocations:** In Three.js/R3F render loops, never instantiate new Vectors, Colors, or Matrices inside `useFrame` or `requestAnimationFrame`. Pre-allocate them outside the loop and mutate them in place to avoid triggering the JavaScript Garbage Collector, which causes stutter.

### Structuring Multi-Scene Websites
- **The Scene Director Pattern:** Implement a centralized "Director" (using Zustand or a Vanilla class) that tracks the user's progress through the "chapters" of the site. Individual components should read from the Director rather than calculating their own intersection observations.
- **Selective Rendering:** Only render what is on-screen. Pause the WebGL `requestAnimationFrame` loop completely if the user has scrolled to a purely DOM-based section, or use `visibilitychange` listeners to pause when the tab is inactive.

### Combining Patterns
- **DO Combine:** GSAP ScrollTrigger + Vanilla Three.js Waypoint Camera arrays (Highly stable and predictable).
- **DO NOT Combine:** Heavy React state updates + R3F high-frequency animations (Will cause massive frame drops due to React reconciliation).

## Fallbacks & Accessibility
- Always implement a `prefers-reduced-motion` check. If true, disable scroll-linked camera interpolation and snap to static viewpoints via `IntersectionObserver`. See `orbit` for an `S-Tier` implementation of this fallback.
