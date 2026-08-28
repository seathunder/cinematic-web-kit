# WebGL Data Globe - Repository Analysis

## 1. Technical Stack & Architecture
- **Framework**: React 18 (TypeScript)
- **Build Tool**: Vite 5
- **Rendering Engine**: React Three Fiber (R3F) & Three.js
- **Animation System**: GSAP 3 & React Spring
- **Scroll System**: GSAP ScrollTrigger driven by a centralized Scene Director.
- **3D System**: R3F with custom BufferGeometry particle systems, custom camera engine, and Drei helpers.
- **State Management**: Zustand
- **Asset Pipeline**: Cached texture loader, `vite-plugin-glsl` for shader imports.

## 2. Architecture Classification
- **Classification**: `DATA_DRIVEN_3D_WORLD` / `R3F_REALTIME`

## 3. Reusable Patterns
- **Scene Director**: A centralized coordinator pattern for managing camera movement, layer visibility, and timeline transitions.
- **BufferGeometry Particles**: Eliminating per-frame allocations by using shared geometry and material resources.
- **Spherical Camera Engine**: Custom math-based camera handling (avoiding standard OrbitControls) for cinematic damping and transitions.
- **Great-Circle Interpolation**: Converting lat/lng into 3D world space and creating arcs for route visualization.

## 4. Code Map
- `src/camera/`: Spherical-coordinate camera system.
- `src/components/canvas/`: R3F scene rendering (Earth, clouds, shaders).
- `src/director/`: Scene Director logic (scroll, transitions, timeline).
- `src/particles/`: BufferGeometry particle engine.
- `src/routes/`: Flight datasets and arc generation.
- `src/shaders/`: GLSL framework.
- `src/stores/`: Zustand state management.
- `src/ui/`: React UI overlays (HUD, control panel, tooltips).

## 5. License and Assets
- **License**: MIT
- **Assets**: NASA Visible Earth textures (day, normal, specular, night lights), Cloud alpha maps (Public Domain / Three.js examples).

## 6. Code Quality
- **Rating**: S
- **Notes**: Production-quality codebase. Highly modular, heavily optimized for performance (stable 60fps on integrated graphics), well-structured for scalability.
