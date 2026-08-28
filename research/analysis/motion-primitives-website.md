# Repository Analysis: motion-primitives-website

## 1. Components
- **Framework:** Next.js 14 (App Router) + React 18
- **Build tool:** Next.js (Webpack/Turbopack under the hood), Tailwind CSS for styling.
- **Rendering engine:** WebGL via `@react-three/fiber` (R3F) and standard DOM rendering.
- **Animation system:** Framer Motion (v11) for fluid layout and UI micro-interactions, GSAP (v3.12.5) for complex timelines.
- **Scroll system:** Lenis for smooth scrolling, combined natively or via GSAP ScrollTrigger.
- **3D system:** `@react-three/fiber` combined with `@react-three/drei`. Spline (`@splinetool/react-spline`) used for high-fidelity imported interactive models.
- **State management:** React state (`useState`, `useRef`), `useFrame` inside R3F for render-loop 3D state, Context APIs where necessary.
- **Asset pipeline:** External Spline URLs for Spline integrations (`https://prod.spline.design/...`), procedural R3F geometries (using `InstancedMesh`), generic video assets for video-scrubbing.
- **Shader/Camera/Interaction architecture:** Experimental 3D components (`DimensionalRift`, `GravityWell`) utilize math-based procedural animation of thousands of instances using R3F's `useFrame` and raw Three.js Math inside a declarative structure.
- **Performance techniques:** 
  - Using `<Suspense>` to lazy load heavy Spline/R3F scenes.
  - Using `InstancedMesh` aggressively inside R3F for particle systems (e.g., thousands of spheres in `dimensional-rift.tsx`).
  - Scroll-linked videos (scrubbing) load metadata first and use native `scroll` listeners with `requestAnimationFrame` / `passive: true`.
- **Responsive strategy:** Tailwind utility classes (`w-full`, `h-full`, `md:flex`, etc.) combined with `useThree().viewport` sizing for 3D elements.
- **Mobile fallback strategy:** Hooks like `useReducedMotion` checking `(prefers-reduced-motion: reduce)` to disable animations/lenis where needed.

## 2. Architecture Category
**R3F_REALTIME**, **VIDEO_SCRUB**, and **DOM_GSAP_CINEMATIC** (This is a massive collection of 110+ animated components spanning DOM-based Framer Motion elements to deep WebGL experiments).

## 3. Reusable Patterns
- **Spline Recolor Pattern:** In `spline-recolor.tsx`, the component loads a Spline scene and recursively traverses the `SPEObject` graph, matching substrings in object names (like "eye", "glow", "body") to dynamically inject a React-controlled `ColorTheme`.
- **Declarative WebGL Experiments:** Grouping complex Three.js math loops inside a vanilla function (e.g. `Rift()`) but wrapping it cleanly inside a `<Canvas>` wrapper with R3F for easy consumption in the Next.js component tree.
- **Scroll Video Scrubber:** Using `video.currentTime = targetTime` driven by native container scroll intersections (`container.getBoundingClientRect()`) over a 300vh sticky container.
- **Hooks Library:** Extraction of standard utilities into custom hooks (`useLenis`, `useGsap`, `useMousePosition`, `useReducedMotion`).

## 4. Code Map
- `src/components/three/experimental/*`: Heavy R3F procedural WebGL particle effects and dimensional rifts.
- `src/components/three/robots/*`: Interactive imported Spline models.
- `src/components/scroll/scroll-video.tsx`: Video scrub on scroll implementation.
- `src/components/transitions/*`: Preloaders and page transitions.
- `src/components/ui/spline-recolor.tsx`: Dynamic theme injection for Spline scenes.
- `src/hooks/*`: Core engine bridging (GSAP, Lenis).

## 5. License & Assets
- **License:** MIT License.
- **Notable Assets:** Relies on Spline URLs hosted on `prod.spline.design`, reducing repo bloat.

## 6. Code Quality
**Rating: A**
High-quality, highly modular component library showing strong usage of modern React ecosystem tools (Next.js, Tailwind, R3F, Framer Motion) all working together cleanly. Excellent for copy-paste workflows (similar to shadcn/ui but for motion).
