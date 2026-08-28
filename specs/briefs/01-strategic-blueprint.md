# Strategic Blueprint for AI-Automated 3D Interactive Web Production and Freelance Commercialization

The landscape of digital experience design is undergoing a profound architectural shift, transitioning from static, document-based interfaces to fully immersive, three-dimensional interactive environments rendered directly within the browser. Historically, the production of these "Awwwards-winning" experiences required substantial capital allocation and large, multidisciplinary studio teams encompassing 3D modelers, technical artists, shader programmers, and frontend performance engineers. However, driven by the maturation of modern graphics APIs like WebGPU, the declarative rendering power of React Three Fiber, and the rapid emergence of generative artificial intelligence, the barrier to entry has collapsed.

This research report provides an exhaustive architectural and commercial blueprint for a solo creative freelancer operating a highly automated production pipeline. Under this paradigm, the human operator assumes the role of the visionary—managing the screenplay, storyboarding, art direction, and client relations—while artificial intelligence functions as the execution engine for asset generation and code orchestration. This document synthesizes the economic realities of freelance commercialization locally in Hyderabad and globally, deconstructs the technical requirements for developing elite interactive experiences, and culminates in the architectural design of a master "Agent Skill" for Anthropic's Claude CLI to automate the entire development lifecycle, perfectly tailored for a solo freelancer operating from a single laptop.

## The Economics of 3D Web Development and Freelance Strategy

To successfully commercialize 3D interactive web experiences as a solo operator, one must understand how to leverage artificial intelligence to eliminate traditional labor bottlenecks. By automating the heavy lifting, you can deliver studio-tier quality at highly competitive freelance rates, allowing you to quickly secure local clients, build your portfolio, and eventually scale to much larger projects.

### Global Market Valuations (For Future Ambitious Projects)

While your immediate focus is securing local clients at accessible rates to build your portfolio, understanding global valuations is crucial for when you are ready to take on bigger, more ambitious projects. In the global market, 3D interactive websites are priced not by page count, but as bespoke software applications. The interactive premium is substantial; a genuinely interactive WebGL or WebGPU build typically costs between two and ten times more than an equivalent static custom site. While a standard custom small-business site runs between $3,000 and $15,000, a truly interactive 3D experience starts around $20,000 and routinely scales into six figures. Elite agencies renowned for award-winning digital craft frequently quote upwards of $60,000 to $150,000+ for flagship global brand launches.

Entry-level animated one-pagers utilizing custom motion and light 3D yield $3,000 to $12,000 per deployment, while mid-tier hero visual sites utilizing custom asset pipelines yield $20,000 to $40,000.

| **Rendering and Site Type** | **Typical Freelancer Range (USD)** | **Typical Studio Range (USD)** | **Timeline Expectation** |
| --------------------------- | ---------------------------------- | ------------------------------ | ------------------------ |
| Product Rendering (Still)   | $50 – $500 per image               | $250 – $1,200 per image        | 3 – 7 days               |
| 3D Animation (Per Minute)   | $500 – $3,000                      | $8,000 – $50,000+              | 3 – 12 weeks             |
| Entry Animated One-Pager    | $3,000 – $12,000                   | $15,000 – $30,000              | 2 – 4 weeks              |
| Real-Time 3D Hero Visual    | $20,000 – $40,000                  | $40,000 – $80,000              | 3 – 8 weeks              |
| Advanced 3D/WebGL Site      | $50,000 – $100,000+                | $100,000 – $200,000+           | 8 – 16+ weeks            |

### The Hyderabad and Indian Domestic Market Strategy

The local market in Hyderabad presents a massive volume of entry-level demand. Ultra-low cost agencies offer basic static HTML or WordPress sites starting around ₹3,800 to ₹6,999. Standard business sites with content management systems range from ₹12,999 to ₹35,000 depending on the provider.

Your strategic entry point as a solo freelancer is to target the ₹3,000 to ₹9,000 range per client. While this matches the pricing of local ultra-low-cost template providers, your AI-automated workflow allows you to deliver a visually stunning, 3D interactive product that vastly outperforms their basic, static WordPress sites. By offering "Elite Global Studio" visuals at standard local prices, you create an extreme value proposition. This will help you secure your first clients rapidly, build a robust, eye-catching portfolio, and gain the necessary experience. Once you have an established reputation and a portfolio of 3D sites, you can comfortably transition to pitching larger, ambitious projects to funded startups or international clients.

### Pre-Client Capital Allocation and Runway Optimization

The operational objective is to spend the absolute minimum capital—keeping the entire operation viable from a single laptop before securing your first paying client. The operational expenses for this highly leveraged workflow approach zero, provided the operator relies on modern API ecosystems and open-source frameworks.

The primary requirement is an advanced Large Language Model (LLM) for code orchestration, such as Anthropic's Claude 3.5 Sonnet, accessed via the Claude Code Command Line Interface (CLI). While free tiers exist, a standard $20/month subscription ensures uninterrupted access to the highest-tier models required for complex shader generation and system architecture. For 3D asset generation, platforms like Meshy AI provide Application Programming Interfaces (APIs) for text-to-3D and image-to-3D generation. These tools offer robust free tiers for prototyping, allowing the operator to generate foundational meshes, which can later be refined, without upfront software licensing costs.

Deployment and hosting infrastructure can be entirely subsidized during the prospecting phase. Platforms such as Vercel and Netlify offer enterprise-grade edge hosting for frontend React and Next.js applications at zero cost for individual developers. The only mandatory upfront capital expenditure is the acquisition of a professional top-level domain, which typically costs between $10 and $15 annually. Therefore, a freelancer armed with just a laptop can realistically architect a world-class, 3D-interactive portfolio and commence prospecting with a total capital expenditure of under $50.

## Architectural Deconstruction of Elite Interactive Experiences

Award-winning interactive websites, frequently recognized by platforms like Awwwards, do not rely on standard web development practices. They utilize a highly specific, modern technology stack designed to circumvent the Document Object Model (DOM) and interface directly with the device's graphics processing unit (GPU). Understanding the interplay of these technologies is critical for instructing AI agents to generate production-ready code.

### The Visual and Interactive DNA of Elite Sites

A detailed analysis of Awwwards "Site of the Year" winners reveals a consistent reliance on immersive, scroll-driven 3D environments that blend traditional typography with fluid spatial interactions. Studios like Immersive Garden utilize minimalistic atmospheric designs combined with bas-relief 3D elements that add a tactile, artistic dimension to the digital journey. Their technical execution relies on Vue.js and Nuxt for the frontend framework, GSAP for animations, Lenis for scroll smoothing, and heavy server-side KTX compression to manage the vast amount of 3D textures required for realism.

Similarly, studios like Wonderland deploy dark, "spacey" user interfaces featuring complex particle systems and 3D typography that reacts dynamically to user scrolling, injecting a surprise factor into the user experience. These elite agencies dedicate separate engineering teams to handle the standard content pages versus the WebGL artwork, highlighting the distinct technical paradigms required for standard DOM manipulation versus 3D canvas rendering. For a solo operator, the AI must bridge this gap, handling both the React-based DOM UI and the Three.js spatial canvas simultaneously.

### React Three Fiber and the Declarative Scene Graph

While vanilla Three.js has dominated the ecosystem for a decade as an imperative JavaScript library, the contemporary standard for complex web applications is React Three Fiber (R3F). R3F is a custom React reconciler that allows developers to build 3D scene graphs declaratively using JSX syntax.

R3F handles the heavy lifting of scene instantiation, render loops, and canvas resizing natively. In traditional Three.js, a developer must manually append a WebGLRenderer to the DOM, instantiate a scene and camera, and write a recursive `requestAnimationFrame` loop to render the scene. R3F abstracts this entirely through a `<Canvas>` component. The `<Canvas>` establishes the context, while child components represent meshes, lights, and cameras.

Crucially, R3F introduces the `useFrame` hook, which allows individual components to participate in the render loop on a per-frame basis. This provides granular control over animations and object mutations. The execution relies on clock deltas to ensure frame-rate independence; modifying an object's rotation via `ref.current.rotation.x += delta` ensures the animation runs at the same perceived speed regardless of whether the user's monitor is refreshing at 60Hz or 144Hz.

### The Evolution from WebGL to WebGPU

Historically, browser-based 3D relied on WebGL (and subsequently WebGL 2.0), a technology based on the aging OpenGL ES 3.0 standard. WebGL suffers from severe architectural bottlenecks, primarily because it relies heavily on a massive global state machine. Changing rendering states—such as binding new textures or switching shaders—requires synchronous communication between the JavaScript CPU process and the GPU driver, resulting in significant CPU overhead and dropped frames when a scene features too many distinct draw calls.

The industry is currently undergoing a fundamental paradigm shift toward WebGPU. Supported natively across major browsers—including Safari 26 on Apple devices as of September 2025—WebGPU is designed to interface with modern native APIs like Vulkan, Metal, and Direct3D 12.

WebGPU abandons the global state machine in favor of immutable pipeline objects. This stateless architecture dramatically reduces CPU overhead by allowing command encoders to batch commands asynchronously, effectively eliminating the cross-process communication bubbles that plagued WebGL. Furthermore, WebGPU introduces Compute Shaders to the browser. Unlike traditional vertex and fragment shaders that are strictly tied to the rendering pipeline, compute shaders allow the GPU to perform general-purpose parallel computations. This enables developers to offload complex physics simulations, massive particle systems, and 3D Gaussian splatting directly to the graphics card, completely circumventing the CPU. Benchmarks indicate that WebGPU delivers execution times three to eight times faster for heavy matrix mathematical computations compared to WebGL, enabling rendering speeds that maintain a steady 60 frames per second on mobile devices even with dense scenes.

### Three Shader Language (TSL)

A significant pain point in traditional 3D web development is writing raw GLSL (OpenGL Shading Language) as string literals embedded within JavaScript files. This archaic method lacks syntax highlighting, type safety, and modularity, making complex visual effects highly prone to compilation errors.

To complement the WebGPU transition, the Three.js ecosystem introduced the Three Shader Language (TSL). TSL is a node-based shader abstraction written purely in JavaScript and TypeScript. Instead of writing raw strings, developers construct shader graphs by chaining functions mathematically, expressing logic declaratively. For instance, creating a pulsing color effect in TSL is written as `const pulse = time.mul(2.0).sin().mul(0.5).add(0.5);`, which is then applied directly to a node material.

TSL is entirely renderer-agnostic; it automatically compiles down to WGSL for WebGPU or GLSL for WebGL depending on the client's hardware capabilities and the selected backend. This abstraction allows for dynamic manipulation of render buffers, seamless integration of post-processing, and automatic optimization of repeated mathematical expressions without the developer managing intermediate compiler flags or manual uniform updates. By manipulating uniforms through the `.value` property of a TSL object inside a `useFrame` loop, the complexity of shader data transmission is radically simplified.

### Cinematic Scroll Orchestration: GSAP and Lenis

The defining characteristic of an elite interactive experience is how the 3D scene responds to user input, particularly scrolling. The objective is to make the 3D canvas perform like a dynamic shot list, where scrolling the mouse wheel scrubs through a timeline of camera movements and object animations.

The industry-standard tool for this orchestration is the GreenSock Animation Platform (GSAP), specifically its `ScrollTrigger` plugin. GSAP allows developers to scrub timelines, pin sections of the HTML DOM, and interpolate complex camera paths—such as moving a perspective camera along a Bezier curve through a 3D environment—flawlessly in sync with the user's scroll position.

However, native browser scrolling is inherently jittery, reliant on the operating system's specific mouse wheel or trackpad physics. To eliminate this inconsistency, developers pair GSAP with smooth-scrolling libraries like Lenis. Lenis intercepts native scroll events and applies mathematical easing, ensuring that the scroll value passed to GSAP's ScrollTrigger is perfectly fluid. This combination allows a 3D camera to sweep across an environment without micro-stutters, resulting in a cinematic feel that distinguishes premium development from amateur implementations.

## Mitigating Technical Debt: Memory Management and Asset Optimization

When delegating code generation entirely to an AI, the primary systemic risk is the generation of functional but highly unoptimized code. In browser-based 3D applications, poor memory management and excessive payload sizes rapidly lead to GPU throttling, extreme battery consumption on mobile devices, and catastrophic context-loss crashes.

### VRAM Leaks and Garbage Collection Protocols

In standard React development, unused variables and unmounted components are automatically purged from system memory by the JavaScript garbage collector. However, WebGL and WebGPU allocate memory on the GPU's Video RAM (VRAM). The JavaScript garbage collector has no jurisdiction over VRAM.

If a 3D model, texture, or material is removed from the React DOM, the associated buffers remain on the GPU indefinitely unless explicitly destroyed. Over time, mounting and unmounting components will bloat the `WebGLRenderer.info.memory.textures` metric until the browser forcibly terminates the WebGL context to protect system stability, resulting in a black screen and a forced page reload. The event loop continues to hold onto GPU bindings independently of React's lifecycle.

To prevent this, the automated workflow must enforce strict disposal protocols. Every geometry, material, and texture must have its `.dispose()` method invoked when it is no longer needed. While React Three Fiber attempts to auto-dispose unmounted objects under normal circumstances, cached assets loaded via hooks like `useLoader` or `useGLTF` are deliberately kept alive to prevent re-fetching. If a user navigates away from a 3D scene and returns, the assets may persist in a detached state. Therefore, the AI must be explicitly instructed to traverse the scene graph recursively—checking every child mesh for materials and geometries—and trigger manual cleanup routines, or alternatively, utilize object pooling for large quantities of meshes to avoid garbage collection spikes entirely.

### Advanced 3D Asset Compression: Draco and KTX2

Raw 3D models (GLTF/GLB formats) and uncompressed textures (PNG/JPEG) are excessively heavy for web delivery. While a PNG texture might take up only 2MB of disk space, it must be fully decompressed into raw uncompressed bitmap data before being loaded into GPU memory, potentially consuming dozens of megabytes of VRAM per texture. This rapid VRAM consumption is the leading cause of crashes on mobile devices.

An optimized production pipeline must implement dual-compression algorithms to minimize both transmission size and GPU memory footprint:

| **Optimization Layer** | **Technology**    | **Mechanism of Action**         | **Benefit** |
| ---------------------- | ----------------- | ------------------------------- | ----------- |
| Mesh Geometry          | Draco Compression | Quantization & Entropy Encoding |             |

Reduces vertex and normal data size by 70% - 90%.

| Texture Assets | KTX2 (Basis Universal) | Supercompressed GPU Textures |   |
| -------------- | ---------------------- | ---------------------------- | - |

Assets remain compressed in VRAM; transcodes directly to native formats (ETC/ASTC) at runtime.

| Instance Rendering | `<InstancedMesh>` | Single Draw Call for Duplicates |   |
| ------------------ | ----------------- | ------------------------------- | - |

Allows thousands of identical objects with minimal CPU overhead.

Draco compression handles the structural geometry of the mesh, utilizing quantization to reduce the precision of vertex attributes from 32-bit floats down to a lower bit depth, followed by entropy coding. Conversely, KTX2 (Basis Universal) handles the visual textures. KTX2 provides two compression modes: UASTC for high-quality textures like normal maps, and ETC1S for massive file size reduction with minor quality loss. Because KTX2 textures do not need to be decoded into raw bitmaps before upload, they eliminate the typical CPU freezing associated with texture loading and dramatically reduce overall memory consumption, allowing far more complex scenes to render seamlessly on mobile hardware.

## The Symbiotic AI-Human Production Workflow

The proposed freelance business model relies on a strict, absolute division of labor between the human operator and the AI agents. By specializing tasks, the operator maximizes throughput and minimizes the technical friction of solo development.

### The Human Domain: Screenplay, Storyboarding, and Art Direction

The human operator ceases to function as a traditional programmer or 3D modeler. Instead, their responsibilities emulate those of a film director and executive producer. The workflow dictates that the human focuses entirely on:

1. **Conceptualization:** Defining the narrative arc and the emotional resonance of the website.
2. **Screenplay & Storyboarding:** Mapping the exact sequence of events. For interactive sites, this involves defining the camera position, object rotations, and text appearances at specific scroll milestones (e.g., 0% scroll, 25% scroll, 100% scroll).
3. **Prompt Engineering & Curation:** Supplying the AI with mood boards, precise technical constraints, and iterating on the generated outputs to ensure aesthetic cohesion.
4. **Client Acquisition:** Utilizing the vast amount of time saved by automation to prospect, pitch, and close clients.

### The AI Domain: Asset Generation and Code Synthesis

The execution of the creative vision is outsourced to the AI layer.

For **Asset Generation**, the human describes the required objects (e.g., "A stylized, low-poly isometric office desk"). The prompt is fed into generative AI APIs like Meshy. Meshy leverages diffusion models and neural radiance fields to instantly generate textured 3D meshes from text or 2D image inputs. These initial models can then be passed through an automated command-line pipeline utilizing tools like `gltf-transform` to apply Draco and KTX2 compression without requiring the human to open specialized 3D software.

For **Code Generation and Orchestration**, writing the boilerplate React Three Fiber code, setting up WebGPU renderers, mapping TSL shaders, and fine-tuning GSAP scroll mathematics is delegated entirely to an advanced LLM, such as Anthropic's Claude 3.5 Sonnet, accessed via a terminal or an AI-native IDE. However, general-purpose AI models suffer from severe context degradation across sessions. They forget the user's preferred tech stack, file structure, and rigorous memory management standards, requiring tedious re-prompting. To circumvent this, the workflow relies on the implementation of **Agent Skills**.

## Developing the Master Claude Agent Skill

An Agent Skill is an open-standard architecture—initially developed by Anthropic and adopted across the ecosystem by OpenAI, Cursor, and GitHub Copilot—that packages reusable workflows, domain expertise, and technical constraints into a highly portable folder structure. By integrating a custom skill into Claude, the AI is permanently transformed into a senior 3D Web Developer perfectly aligned with the optimal tech stack.

### The Architecture of Agent Skills

An Agent Skill is simply a directory containing a `SKILL.md` file, which utilizes YAML frontmatter for metadata and standard Markdown for instructions, alongside optional reference folders.

The defining characteristic of an effective skill is **Progressive Disclosure**. Attempting to paste thousands of words of technical documentation into an AI's initial prompt causes the context window to degrade, leading to hallucinations and poor instruction adherence. Progressive disclosure solves this: Claude reads only the title and description of the skill at startup, consuming a mere 30 to 50 tokens. When the human prompts, "Build a scrolling 3D landing page," Claude recognizes the semantic trigger, loads the primary `SKILL.md` file, and uses internal bash tools to read supplementary reference files (e.g., `gsap-rules.md`, `tsl-shaders.md`) only exactly when they are required for the task. This keeps the active context lean and highly focused.

For operators using Windows, Claude Code runs within the Windows Subsystem for Linux (WSL). Personal skills must be installed in the WSL filesystem at `~/.claude/skills/`, which is accessible from the standard Windows Explorer at the path `\\wsl$\Ubuntu\home\username\.claude\skills\`. This allows the developer to easily drag and drop the necessary markdown files to configure the AI.

### Complete Skill Implementation: `3d-web-master`

To architect the ultimate skill, the developer must create a folder named `3d-web-master` inside the `.claude/skills/` directory. Inside this folder, a specific architecture must be deployed to enforce the constraints identified in this report.

The file structure is as follows:

\~/.claude/skills/3d-web-master/

├── SKILL.md

└── references/

├── tech-stack-rules.md

├── r3f-performance.md

├── gsap-scroll.md

└── tsl-shaders.md

The following raw text and markdown must be injected into the respective files. This effectively programs the AI to output elite, Awwwards-level code autonomously while avoiding catastrophic performance failures.

#### 1. The Orchestration File: `SKILL.md`

This file acts as the router, instructing the AI on when to consult deeper documentation.

## name: 3d-web-master description: >- The ultimate 3D Web Development architect. Use when the user asks to build, animate, or design a 3D interactive website, WebGL/WebGPU experience, or spatial web application. when\_to\_use: Trigger this skill when the user mentions Three.js, React Three Fiber, GSAP, WebGPU, shaders, or 3D scroll animations.

# 3D Interactive Web Development Meta-Skill

You are an elite, Awwwards-winning creative developer and technical architect. Your goal is to translate the user's creative vision into production-ready, highly optimized 3D web code.

## Core Directives

1. **Understand the Vision:** Before writing code, ask the user for the "Screenplay"—the narrative of the 3D scene and how it reacts to user scroll/input.
2. **Read the References:** You operate using a highly specific technology stack. Depending on the task, you MUST use the bash tool to read the corresponding reference files in the `references/` directory of this skill to ensure you do not hallucinate legacy code.
3. **Execution:** Write the code flawlessly. Use modular React components. Never leave VRAM memory leaks.

## Progressive Disclosure Trigger System

Analyze the user's request, then read the necessary files:

- If setting up the project, layout, or rendering engine, read: `references/tech-stack-rules.md`
- If handling 3D models, performance, instantiation, or memory, read: `references/r3f-performance.md`
- If creating scroll animations, Lenis integration, or camera paths, read: `references/gsap-scroll.md`
- If writing custom materials, post-processing, or shaders, read: `references/tsl-shaders.md`

## Workflow Enforcement

1. Always implement a `<Canvas>` configured for WebGPU with a WebGL2 fallback.
2. Always assume GLTF models are compressed via Draco and KTX2. Remind the user to process assets through `gltf-transform` if they have raw files.
3. Assume a mobile-first, responsive approach where the 3D canvas scales gracefully.

#### 2. The Infrastructure Rules: `references/tech-stack-rules.md`

This file enforces the modern 2026 tech stack constraints, preventing the AI from falling back on legacy React patterns.

# Technology Stack Constraints

## 1. Core Frameworks

- Use **Next.js** (App Router) or **Vite** as the frontend build tool.
- Use **React Three Fiber (R3F)** (`@react-three/fiber`) for the declarative scene graph.
- Use **Drei** (`@react-three/drei`) for helpers (OrbitControls, Environment, useGLTF, useKTX2).

## 2. WebGPU Initialization

WebGL is legacy. Always target WebGPU using the zero-config initialization available in modern Three.js.

- Import WebGPU specific classes: `import * as THREE from 'three/webgpu';`
- In R3F, configure the `<Canvas>` to handle asynchronous WebGPU initialization. The setup should look like this:

  `gl={async (props) => { const renderer = new THREE.WebGPURenderer(props); await renderer.init(); return renderer; }}`
- If WebGPU is unavailable on the client device, it must automatically fall back to WebGL2.

## 3. Styling and DOM Overlays

- Use **Tailwind CSS** for absolute positioning of HTML UI elements over the 3D `<Canvas>`.
- Crucially, use the `pointer-events-none` class on full-screen UI overlays to ensure the underlying 3D canvas still receives mouse hover and click interactions, explicitly setting `pointer-events-auto` only on actual clickable DOM buttons.

#### 3. The Memory Management Rules: `references/r3f-performance.md`

This file prevents the AI from writing code that causes browser crashes or GPU throttling.

# Performance and Memory Management Rules

## 1. Frame Loop Optimization

- NEVER use React `setState` inside the `useFrame` hook. This triggers React reconciler overhead, ruins the garbage collector, and destroys framerate.
- Always mutate object references directly using clock deltas to ensure refresh-rate independence.

  *Example:* `meshRef.current.rotation.y += delta * speed;`

## 2. VRAM Memory Leaks (CRITICAL)

- The JavaScript Garbage Collector does NOT clean up GPU Video RAM.
- When unmounting components, you must ensure `.dispose()` is called on all custom Geometries, Materials, and Textures.
- For assets loaded via `useGLTF` or `useKTX2`, recognize that they are cached globally by suspense. If they are dynamically spawned and destroyed, use `dispose={null}` on the primitive and manage cleanup manually.
- If unmounting a complex scene, write a `useEffect` cleanup function that traverses the scene graph (`scene.traverse`) and calls `.dispose()` on every child mesh's geometry and material.

## 3. Draw Calls & Instancing

- If the user requests rendering more than 50 identical objects (e.g., a field of grass, floating particles), you MUST use `<InstancedMesh>` or Drei's `<Instances>` component to reduce the draw calls to exactly 1.
- Limit real-time lighting computations. Prefer baked lighting, lightmaps, or MatCaps where photorealism is not strictly required.

#### 4. The Animation Rules: `references/gsap-scroll.md`

This file guides the AI on achieving cinematic, jitter-free animations.

# Scroll and Animation Architecture

## 1. Smooth Scrolling

- Integrate **Lenis** (`@studio-freight/lenis`) at the root layout for mathematical smooth scrolling.
- Hook Lenis into GSAP's `Ticker` to keep the 3D render loop and the DOM scroll completely synchronized, eliminating frame tearing.

## 2. GSAP ScrollTrigger inside R3F

- Pass scroll progress into the R3F canvas context.
- Use GSAP timelines (`gsap.timeline({ scrollTrigger: {...} })`) to animate `ref.current.position` and `camera.position`.
- Use the `scrub: true` property (or a numerical value like `scrub: 1` for interpolation smoothing) to bind the timeline's progress directly to the scrollbar.
- For complex camera paths, define a `THREE.CatmullRomCurve3`. Use GSAP to animate a floating value from 0 to 1, and use `curve.getPointAt(value)` inside `useFrame` to update the camera position to follow the track dynamically.

#### 5. The Shader Rules: `references/tsl-shaders.md`

This file forces the AI to abandon string-based GLSL in favor of modern node-based compilation.

# Three Shader Language (TSL)

## 1. Node-Based Shading

- Do NOT write raw GLSL strings. Do NOT use `ShaderMaterial` with string literals.
- Use TSL. Import specific nodes from `three/tsl` (e.g., `color, mix, uv, time, positionLocal, float, sin`).
- Build shader logic using JavaScript method chaining.

  *Example:* `const pulse = time.mul(2.0).sin().mul(0.5).add(0.5);`

## 2. Material Integration

- Construct visual logic and assign it to Node Materials (e.g., `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`).
- Override specific properties rather than writing the entire lighting model from scratch.

  *Example:* `material.colorNode = color(0xff0000).mul(pulse);`

## 3. Uniform Management

- Use the `uniform()` function from `three/tsl`.
- Update uniform values inside the `useFrame` hook by targeting the `.value` property of the TSL uniform object. This entirely eliminates the legacy `uniforms: { uTime: { value: 0 } }` syntax and creates a seamless bridge between the render loop and the GPU pipeline.

## Strategic Conclusion

By deliberately separating the creative vision from the rigorous technical execution, you can harness artificial intelligence to function as your personal production team. The economic strategy involves using automated tools to drastically overdeliver on value at the ₹3,000 to ₹9,000 price point, dominating the local entry-level market to build your portfolio.

The implementation of the compiled Agent Skill architecture outlined in this report ensures that your AI coding assistant is constrained to strict, modern best practices. By forcing the utilization of WebGPU for compute-heavy performance, TSL for modular shader generation, GSAP and Lenis for cinematic scrolling, and rigorous VRAM disposal logic to guarantee stability, this workflow practically guarantees output that meets elite quality thresholds. This highly leveraged model keeps overhead practically at zero, turning a solo developer with a single laptop into a highly competitive freelancer, ready to dominate the entry-level market and gradually scale toward ambitious global projects.