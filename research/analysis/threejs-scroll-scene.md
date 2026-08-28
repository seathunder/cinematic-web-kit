# Three.js Scroll Scene - Repository Analysis

## 1. Technical Stack & Architecture
- **Framework**: Vanilla TypeScript
- **Build Tool**: Vite
- **Rendering Engine**: Three.js (raw)
- **Animation System**: GSAP (GreenSock)
- **Scroll System**: GSAP ScrollTrigger for scrubbing timeline animations.
- **3D System**: Standard Three.js (Groups, Standard Materials, Lighting, Icosahedrons).
- **State Management**: Implicit state managed by the GSAP timeline.
- **Asset Pipeline**: Managed by Vite.

## 2. Architecture Classification
- **Classification**: `THREEJS_CAMERA_RAIL`

## 3. Reusable Patterns
- **Waypoint Navigation**: Defining an array of `Waypoint` objects (`camera`, `look`) that a GSAP timeline tweens between based on scroll progress.
- **Motion Preference Fork**: Completely distinct logic paths for standard motion (GSAP timeline scrubbing) vs. reduced motion (IntersectionObserver snapping to waypoints).

## 4. Code Map
- `index.html`: Contains the structural markup and section containers.
- `src/main.ts`: Houses all application logic, from Three.js scene setup to the GSAP ScrollTrigger configuration and the animation loop.

## 5. License and Assets
- **License**: MIT
- **Assets**: Procedural geometries and standard materials (no external textures).

## 6. Code Quality
- **Rating**: A
- **Notes**: Very concise, easy to follow, and demonstrates a robust approach to GSAP camera scrubbing while providing a solid fallback for accessibility.
