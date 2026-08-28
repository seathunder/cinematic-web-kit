# What to Steal (Implementation Patterns)

*Note: This index highlights technical implementation patterns to study and reproduce, not code to copy verbatim.*

## Scroll Systems

### Lightweight DOM-to-WebGL Sync
1. **Concept:** Driving a `requestAnimationFrame` WebGL render loop natively from Lenis scroll data using a lerped state object without React overhead.
2. **Best Reference:** `awwwards-3d`
3. **Important Files:** Check the core application setup and the state manager.
4. **How it works:** A mutable state object holds `current` and `target` scroll values. The native Lenis scroll event updates `target`. The WebGL `requestAnimationFrame` loop continually `lerp`s `current` towards `target` and passes it to the camera/shaders.
5. **Why it is useful:** It decouples the DOM scroll event from the WebGL render rate, guaranteeing buttery smooth WebGL updates regardless of the browser's DOM event dispatch rate.

### Hybrid State Mutation
1. **Concept:** Mutating CSS variables and external state objects from a React `useFrame` or event listener to bypass React reconciliation.
2. **Best Reference:** `lattice-drift`
3. **Important Files:** The hooks bridging scroll and Three.js.
4. **How it works:** Instead of storing scroll progress in `useState` (which triggers full component re-renders), the progress is written directly to `document.documentElement.style.setProperty('--scroll', val)` and read by a Vanilla Three.js instance inside a `useEffect`.
5. **Why it is useful:** Maximizes performance in React applications by avoiding unnecessary React lifecycle calls during high-frequency events like scrolling.

## Camera Systems

### Timeline Waypoint Scrubbing
1. **Concept:** Tweening camera position and look-at targets through a predefined array of spatial waypoints using GSAP ScrollTrigger.
2. **Best Reference:** `threejs-scroll-scene`
3. **Important Files:** `src/main.ts`
4. **How it works:** An array of `Waypoint` objects (containing camera coordinates) is parsed into a GSAP timeline. ScrollTrigger maps the scrollbar to the progress of this timeline, smoothly scrubbing the camera through the scene.
5. **Why it is useful:** It is the most robust and designer-friendly way to orchestrate complex "fly-through" cinematic sequences.

## Performance & State

### The "Scene Director"
1. **Concept:** Centralizing the orchestration of scroll timelines, camera transitions, and WebGL layer visibility into a single manager.
2. **Best Reference:** `Webgl-Data-Globe`
3. **Important Files:** `src/director/`
4. **How it works:** Instead of individual components listening to scroll independently, a Scene Director component (often using Zustand) calculates the global "chapter" or phase of the experience and dispatches commands to the camera and particle systems.
5. **Why it is useful:** Prevents spaghetti code in complex multi-scene WebGL applications and ensures animations stay synchronized.

## Accessibility

### Native Reduced-Motion Fallbacks
1. **Concept:** Respecting `prefers-reduced-motion` deeply within the WebGL render loop.
2. **Best Reference:** `orbit`
3. **Important Files:** `src/scene.js`, `src/scroll.js`
4. **How it works:** A utility checks `window.matchMedia('(prefers-reduced-motion: reduce)')`. If true, the system disables the lerp loop, snaps the camera directly to section viewpoints via `IntersectionObserver`, and pauses particle simulations.
5. **Why it is useful:** It makes cinematic WebGL accessible and usable for users with vestibular disorders.
