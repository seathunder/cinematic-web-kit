# Repository Analysis: lattice-drift

## 1. Components
- **Framework:** React 19 (via Vite)
- **Build tool:** Vite 6, TypeScript
- **Rendering engine:** WebGL via Three.js (r185) directly, not via `@react-three/fiber`.
- **Animation system:** GSAP (v3.15.0) for timelines and easing, standard CSS Custom Properties for DOM animations.
- **Scroll system:** Lenis (v1.3) with GSAP ScrollTrigger.
- **3D system:** Vanilla Three.js wrapped in a React `useEffect` inside a `SceneCanvas` component.
- **State management:** Custom mutable module state `motionState.ts`. The scroll and pointer handlers write to this mutable object instead of React state to avoid React re-render overhead.
- **Asset pipeline:** Code-driven procedural geometry (IcosahedronGeometry, TorusKnotGeometry) combined with `InstancedMesh`.
- **Shader/Camera/Interaction architecture:** Camera target lerps based on pointer tracking and scroll progress. 3D elements (field and core) respond to scroll progress mapping via `MathUtils.damp`.
- **Performance techniques:** 
  - Mutable state container outside React's render cycle for RAF and scroll updates.
  - Three.js is imported directly rather than React Three Fiber, minimizing overhead.
  - Using `InstancedMesh` with `frustumCulled = false` for the shard field to batch draw calls.
  - CSS Variables updated on the document root (`--page-progress`, `--scroll-velocity`) to drive CSS animations without React re-renders.
  - The 3D Canvas itself is lazy-loaded (`React.lazy()`) with `Suspense`.
- **Responsive strategy:** Handles resize natively inside `SceneCanvas`, updating camera aspect and capping device pixel ratio.
- **Mobile fallback strategy:** Listens to `prefers-reduced-motion: reduce`. Disables complex canvas interactions, skips Lenis initialization, updates `motionState` via native scroll instead.

## 2. Architecture Category
**HYBRID_DOM_3D** and **SCROLL_DRIVEN_GSAP** (Native Three.js intertwined smoothly with React DOM elements).

## 3. Reusable Patterns
- **Mutable Module State:** An external `motionState` object holding `scroll, progress, velocity, pointerX, pointerY` which is written to via Lenis/Pointer events and read by the Three.js RAF loop. This completely avoids React's reconciliation process for high-frequency updates.
- **Root CSS Variables for Scroll:** Pumping `--page-progress` and `--scroll-velocity` straight to `document.documentElement.style` inside the Lenis scroll callback to synchronize DOM styling without JS re-renders.
- **Lazy WebGL:** `const SceneCanvas = lazy(...)` to prevent WebGL compilation from blocking initial page paint.

## 4. Code Map
- `src/App.tsx`: App shell wrapping layout in `SmoothScroll` and `PageMotion`.
- `src/components/SceneCanvas.tsx`: Vanilla Three.js environment wrapped in a React component, updating via RAF.
- `src/components/SmoothScroll.tsx`: Initializes Lenis, handles pointer tracking, and updates `motionState`.
- `src/lib/motionState.ts`: The mutable store for all animation driver variables.
- `src/components/PageMotion.tsx`: GSAP timeline configurations for DOM elements.

## 5. License & Assets
- **License:** MIT License.
- **Notable Assets:** No large external models, highly procedural geometry used. Standard SVG assets (mark, social card).

## 6. Code Quality
**Rating: A**
Clean implementation demonstrating how to build a high-performance WebGL + React experience without R3F. The decoupled state management for animation variables is a best practice.
