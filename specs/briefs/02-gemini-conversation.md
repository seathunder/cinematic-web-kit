

# Conversation with Gemini

Notice how animated interactive and cinematic the websites in the videos are? i want the claude skill that'll allow me to do that. if not available, the skill i need to learn to do that. this incredible level of animation, interactablity is a must and should. they flow into the next frame with detachable parts and animation. and everything is artistic

Those interactive sites are truly incredible—they completely blur the line between a standard webpage and a cinematic experience. Just a quick heads-up: I'm Gemini, not Claude!

While AI is a fantastic co-pilot for troubleshooting code or writing automation scripts, there isn't a single AI tool or prompt that can generate a fully bespoke, scroll-linked 3D masterpiece from scratch just yet. Achieving that level of artistic flow and technical precision requires mastering a specific subset of front-end development known as **Creative Coding**.

Building these experiences is essentially bridging the gap between rigorous software engineering and the visual pacing of a well-edited film. The transition from building complex data pipelines or AI architectures to rendering 3D web environments involves a learning curve, but the foundational computer science logic is exactly the same. Furthermore, having a pre-existing eye for cinematography, framing, and color grading translates perfectly into setting up lighting, materials, and camera angles in a 3D browser scene.

Here is the exact tech stack you need to learn to build these:

### The Creative Developer Stack

- **Three.js (and React Three Fiber):** This is the core engine. Three.js is a JavaScript library that makes working with WebGL (the browser's 3D graphics API) much easier. React Three Fiber is the modern standard for integrating these 3D scenes into React applications.
- **GSAP (GreenSock Animation Platform):** This is the secret behind the elements that "flow into the next frame with detachable parts." GSAP is the industry standard for buttery-smooth, heavily timeline-based web animations, especially when tied to the user's scroll position (using ScrollTrigger).
- **Blender:** To get those beautiful 3D assets (like the tiger or the floating statues in the videos), you need 3D models. Blender is a free, incredibly powerful 3D modeling and animation software used to sculpt, texturize, and export assets for the web.
- **GLSL (Shaders):** For the truly mind-bending artistic effects—like water ripples, granular distortion, or melting transitions—you will eventually need to learn how to write custom shaders using GLSL, a C-style language that runs directly on the GPU.

### Where to Start

If you want to dive in, the absolute best resource in the industry right now is **Three.js Journey** by Bruno Simon. It takes you from the basic geometry of a cube all the way to importing complex models, writing custom shaders, and optimizing performance.

What kind of cinematic 3D experience or theme would you want to build first?

No i meant claude skills. claude has skill packs. which skill do i need to install, and ofc im in the building loop I'll be doing work. but i want claude to automate as much as i can

Ah, got it! You're referring to **Agent Skills** (the modular `SKILL.md` packages) that teach the AI specific procedural workflows so you don't have to rewrite massive system prompts for every new component.

Since you want to automate the heavy lifting of Three.js, WebGL, and scroll-linked animations while staying in the driver's seat, there are a few community-built skill packs specifically tailored for this high-end frontend stack.

### Essential 3D Web Skill Packs

- **Claude Design Skillstack (****`freshtechbro/claudedesignskills`****):** This is the holy grail for what you want to achieve. It has a specific `core-3d-animation` bundle containing dedicated skills for `threejs-webgl`, `gsap-scrolltrigger`, and `react-three-fiber`. It comes loaded with specialized agents and slash commands to instantly generate boilerplate for 3D scenes and complex timeline animations.
- **3D Web Experience (****`3d-web-experience`****):** Often found in skill marketplaces, this pack acts as a "3D Web Experience Architect." It focuses heavily on WebGL optimization, glTF asset pipelines, and common scroll effects—like camera movement through a scene or exploded view animations. It's fantastic for bridging the gap between your 3D assets and the browser without tanking performance.
- **Three Agent Skills (****`emalorenzo/three-agent-skills`****):** If you end up using React for your frontend, this skill pack contains over 70 strict rules for React Three Fiber (R3F) best practices. It enforces critical engineering constraints like object pooling and component caching so your cinematic transitions remain perfectly smooth and don't drop frames.

### How to Install and Use Them

To integrate these into your local development workspace using the Claude Code CLI:

- **Install:** Clone the skill repositories and copy the specific skill folders (like `threejs-webgl` or `gsap-scrolltrigger`) directly into your project's `.claude/skills/` directory.
- **Auto-Activation:** These skills use "progressive disclosure." The AI reads the YAML frontmatter in the background and will automatically load the full, heavy instruction set only when it detects you are actively working on a 3D scene, PBR materials, or GSAP animations.
- **Manual Trigger:** You can also force-invoke them to start a workflow using slash commands (e.g., typing `/threejs-webgl Create a particle field that reacts to scroll position`).

Are you planning to run this setup through the Claude Code CLI in your terminal, or are you manually uploading the zip files via the web interface for this build?

Claude cowork desktop app on windows

Claude Cowork isn't a separate, standalone application; rather, it is a dedicated workspace built directly into the official Claude Desktop app. The desktop app runs natively and is fully supported on Windows 10 and higher.

Here is how the Cowork feature operates on Windows:

- **The Three Modes:** The Claude Desktop app is divided into three distinct tabs: Chat for standard conversations, Cowork for autonomous agentic work, and Code for software development.
- **What Cowork Does:** Instead of functioning as a typical chat assistant, Cowork acts as an AI agent that can plan and execute multi-step workflows on your behalf. It is granted direct access to read, write, and organize your local files and folders.
- **Requirements:** While the standard Chat mode is available on the free tier, accessing the Cowork and Code tabs requires a paid Claude subscription, such as Pro, Max, Team, or Enterprise.
- **Background Execution:** Cowork can continue processing large local tasks in the background. However, local desktop sessions require the Claude Desktop app to remain open and your Windows machine to stay powered on until the task is complete.

**How to get started on Windows:**

1. Download the official Windows installer directly from `[claude.com/download](https://claude.com/download)`.
2. Install the application and sign in with your paid Claude account.
3. Navigate to the **Cowork** tab instead of Chat.
4. Point Claude to a specific local folder on your machine and grant it the necessary read and write permissions to begin your automated workflow.

Is there a specific local task or file structure you are hoping to hand off to Cowork first?

If i enable deepresearch for this task, willit retain the context and video access within the chat or will i have to do it in a new chat again?

Just a friendly reminder again—I am Gemini, Google's AI! But since you're working in Claude's desktop app, I can absolutely help you navigate its interface.

You **will not** need to start a new chat. You can enable it directly in your current thread, meaning your conversation history and those attached videos will remain perfectly intact.

Depending on exactly which "deep research" feature you are using in Claude, here is how it handles your context:

- **Native Claude "Research" Feature:** You can activate this directly in your current conversation. Simply click the "+" button located at the bottom left of your chat interface and select "Research". A blue indicator will appear at the bottom of the window to confirm it is running. Because you toggle it on within the active window, Claude retains full access to the internal context and media you have already provided.
- **Custom "Deep Research" Cowork Skill:** If you installed a dedicated community skill bundle (like the popular `robertnowell/deep-research` skill) into Cowork, you also stay right where you are. You trigger it within your active session using a slash command. The agent runs directly inside your existing workspace sandbox, giving it access to all the files and context already mounted in that specific session.

Are you planning to run the research feature to gather technical documentation, or are you hoping the agent will jump straight into writing the Three.js and GSAP code for you?

I mean gemini's deepresearch. for the research part I've been asking you, since the start of the chat here

My apologies for the confusion! Since you were asking about "Claude skills" and mentioned the "Claude Cowork desktop app" in your previous messages, I got my wires crossed and focused on that ecosystem.

To answer your question directly: **Yes, you can absolutely use Deep Research right here in this chat.** You do not need to start a new conversation or re-upload those videos. I will retain the context of everything we have discussed so far.

Here is exactly how you can trigger and use my Deep Research feature for this project:

### Triggering Deep Research

- Right here in our current chat, go to the text box.
- Click **Add Files** and select **Deep Research**.
- Type your prompt explaining what you want to research.

### How the Process Works

- **The Plan:** Instead of generating an instant response, Gemini follows a methodical, multi-step workflow. It will transform your prompt into a research plan.
- **Your Control:** Gemini will present this plan to you. You can review it and click **Edit plan** to make updates before generating the report.
- **The Execution:** Once you click **Start research**, the task will run in the background. Generating the report usually takes about 5 to 10 minutes since many sources are analyzed.
- **Asynchronous Freedom:** You can leave the chat while you wait for the report. The asynchronous system allows you to hop to a different app or even turn off your computer after starting the project.
- **The Notification:** When it is ready, you will be notified next to the chat thread in the web app.

The final report will be highly detailed. If you are on a Google AI Ultra plan, Deep Research reports can also include interactive simulators, diagrams, and charts directly in the report.

What specific aspect of those animated 3D sites should we have the Deep Research agent focus its plan on first?

Alright so, i want you to develop a workflow where i get the creative side of the work, like scripting and screenplay and stuff, while assets, code, and the rest of the work is done by ai. preferably free. if not, as cheap as possible. i wanna outsource as much work as possible to ai. to both finish it fast anf reduce the work and increase the quality. find the skills from the web, combine em and make one ultimate skill, that i can give to claude. also before you do all of that, take a look through the videos i sent and research more about how they are made, how much they can pay me if i find clients and how much can i reasonably spend before finding my first client.

Here's a research plan for that topic. If you need to update it, let me know!

 AI 3D Web Development Workflow 

Research Websites

(1) Analyze the core technologies and frameworks required to build high-end cinematic 3D interactive websites. (2) Find average freelance rates and project fees for developing premium 3D web experiences for global clients and local clients in Hyderabad, Telangana, India. (3) Evaluate the reasonable upfront costs and minimum budget required to start a 3D web development freelance business before acquiring the first client. (4) Identify free or low-cost AI tools capable of generating: (a) high-quality 3D assets (b) realistic textures (c) environment models (d) WebGL and Three.js code (5) Synthesize a hybrid production workflow that assigns creative direction and scripting to the user while delegating technical asset creation and coding to the identified AI tools. (6) Compile the researched workflow, tool integrations, and development frameworks into a unified comprehensive instruction set designed for an AI assistant to automate technical execution.

Analyze Results

Create Report

Ready in a few mins

Start research

I've completed your research. Feel free to ask me follow-up questions or request changes.

AI 3D Web Development Workflow

Aug 19, 8:20 PM

You built it like you need it for an agency. no. personalize for me. one laptop, as low a cost as possible, charging 3-9k ₹ per client, more after i get experience and have a bigger ambitious project from the client

Sure, I can adjust the business strategy to fit your exact situation. I'll remove the agency focus and tailor the pricing and cost sections for a solo freelancer working from a single laptop, targeting that ₹3,000 - ₹9,000 entry point to build up to bigger projects.

Here is your updated research:

AI 3D Web Development Workflow

Aug 19, 8:42 PM

I've updated the introductory framing, rewritten the entire market and economics section to reflect your strategy of charging ₹3,000 - ₹9,000 using only a single laptop and free AI tools, and updated the conclusion. I left all of the technical React Three Fiber and WebGPU code parameters exactly the same, as those are the core mechanics that will help the AI build the websites for you. Let me know if you need any other changes!

How much does runway and mcp help

Both Runway and MCP (Model Context Protocol) are massive accelerators for a solo developer looking to cut costs, save time, and automate workflows. Here is how each fits into your strategy:

**Runway (Specifically Gen-3 Alpha/Turbo)**
Runway is a generative AI video tool that can instantly produce photorealistic, cinematic motion from a simple text prompt or a single image. For a 3D web developer, this is a game-changer for asset creation. Instead of spending days modeling, texturing, and rendering a complex background animation or an introductory scene, you can use Gen-3 to generate a flawless 10-second looping video. Because it understands how objects move through space and time, the results look like expensive 3D renders but require zero modeling effort and no heavy hardware on your end. You can use these generated clips as dynamic video textures, background environment maps, or cinematic transitions on your websites.  

**MCP (Model Context Protocol)**
MCP is the technology that allows your AI assistant (like Claude) to connect directly to your external tools and data. If Agent Skills act as the "brain" teaching the AI how to write 3D code, MCP acts as the AI's "hands." By using MCP servers, your AI agent can securely read your local filesystem, pull design specifications directly out of Figma, manage your code on GitHub, or even trigger live deployments to hosting platforms like Vercel. It transforms the AI from a simple chatbot that hands you code snippets into a true digital co-worker that can pull assets and execute commands across your actual development toolchain.  

alright, make me a short checklist of skills i should download, where to download, and how to add to claude code's customize feature. i wanna build a portfolio website, 2D animation images with proper cinematic transition, a japanese samurai shall be there

Here is a targeted checklist and installation guide to get your portfolio built and your cinematic samurai transition running.

### 1. Checklist of Skills and Tools to Download

**For Claude (Coding & Architecture):**

- **Web Framework Skill:** You will need a standard React or Next.js skill to lay down the boilerplate for your portfolio.
- **Creative & Design Skills:** Anthropic maintains an official repository of skills (including creative and design workflows) at `[github.com/anthropics/skills](https://github.com/anthropics/skills)`.  


- *Note:* The custom `3d-web-master` skill architecture outlined earlier is something you create yourself by making a folder and pasting the provided text into a `SKILL.md` file.

**For the Samurai Animation (Video Generation):**
Claude handles the code, but it cannot generate video files. For the 2D samurai animation, use **Runway Gen-3 Alpha** or **Gen-3 Turbo**. Gen-3 is specifically trained to understand how objects move through space and time, allowing you to turn a static 2D image of a samurai into a fluid, 10-second cinematic sequence with perfect frame consistency. You can generate this clip and then have Claude write the GSAP code to trigger the video's playback as the user scrolls down your portfolio page.  

### 2. Where to Find and Download Skills

- **The Skills Directory:** You can find community-built skills at `skillsdirectory.com`.  


- **Anthropic's GitHub:** You can clone or download ZIP files of official Anthropic skills from their public repository.  


- **Claude Code Marketplace:** If you are using the CLI, you can directly browse plugins by typing `/plugin marketplace add anthropics/skills` to see available document and example skills.  



### 3. How to Add Skills to Claude

**Method A: Using the Claude Desktop App (Cowork Interface)**
If you are using the visual interface of the desktop app:

1. Go to **Customize > Skills** in the menu.  


2. Click **Add** (or "Add custom skill").  


3. You can either upload your `SKILL.md` file directly or upload a ZIP file of the entire skill folder.  


4. Ensure the skill is toggled "on" in the menu, and then try a prompt to trigger it.  



**Method B: Using the Claude Code CLI (Terminal)**
If you are running the project from your terminal, Claude looks for skills in specific folders:

1. **Global Skills (For all projects):** Create a folder in `~/.claude/skills/` (e.g., `~/.claude/skills/portfolio-builder`) and place your `SKILL.md` file inside.  


2. **Project-Specific Skills:** Create a `.claude/skills/` folder directly inside your active website's root directory and place your skills there.  


3. **Quick Install Command:** You can also copy an install link from the Skills Directory and paste it directly into your terminal, like this: `claude skill add [https://www.skillsdirectory.com/api/registry/skill-name](https://www.skillsdirectory.com/api/registry/skill-name)`.  



Once your skills are loaded, you can tell Claude, "Build my portfolio layout, and create a section where this Runway Gen-3 samurai video plays on scroll," and the agent will use its loaded instructions to orchestrate the code.

arent these skills already existing? i want the skills that claude by default doesnt have

You are absolutely right—you don't need to write these from scratch if you don't want to. While Claude comes with basic built-in skills for standard programming (like debugging or code review), it *does not* have deep, specialized knowledge for cinematic 3D web design, GSAP orchestration, or WebGL by default.  

To get that Awwwards-level quality without writing the instructions yourself, you need to download third-party community skills.

Here is your exact checklist to build your Samurai cinematic portfolio:

### 1. The Skill Checklist (What to Download)

- **For the 3D/Canvas Setup:** Get the `CloudAI-X/threejs-skills` bundle. This teaches Claude the exact, up-to-date API references for Three.js fundamentals, geometry, lighting, and performance optimization.  


- **For the Cinematic Scrolling:** Download the official GreenSock skills (`greensock/gsap-skills`) or the `mindrally-skills-gsap` pack. This gives Claude the correct rules for timelines and ScrollTrigger, which you will use to scrub through your Samurai video frame-by-frame as the user scrolls down the page.  


- **For the Premium Aesthetic:** Grab the `devmartinese/awwwards-animations-skill` or the Anthropic `frontend-design` skill. These specifically instruct the AI to avoid generic "AI slop" (like standard purple gradients and basic Bootstrap cards) and instead focus on smooth scrolling (Lenis), parallax, and premium typography.  



### 2. Where to Download Them

- **The Skills Directory:** You can browse, search, and install community skills directly from `skillsdirectory.com`.  


- **GitHub Repositories:** Many developers host massive bundles on GitHub. For example, the `freshtechbro/claudedesignskills` repository is a massive design agency stack with over 20 specific plugins for WebGL, React Three Fiber, and GSAP.  


- **Anthropic's Official Repo:** Find baseline creative and design skills curated by the creators of Claude at `[github.com/anthropics/skills](https://github.com/anthropics/skills)`.  



### 3. How to Add Them to Claude's Customize Feature

Since you are using the visual Claude app on Windows (rather than the command-line interface), here is how you install them:

1. Download the community skill you want from GitHub or the directory. It will usually be a single `SKILL.md` file or a `.zip` folder containing the file.  


2. In the Claude app, navigate to **Customize > Skills** (or Settings > Features > Skills on the web view).  


3. Click the **Add** or **Add custom skill** button.  


4. Upload your downloaded `SKILL.md` or `.zip` file directly into the interface.  


5. Ensure the skill is toggled to "enabled" in the menu.  



Once enabled, just tell Claude, "Use the GSAP and Three.js skills to build a scrolling portfolio for my Samurai animation," and Claude will automatically read those downloaded expert instructions to generate your custom code.  

[Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)

[code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)

[GitHub - CloudAI-X/threejs-skills](https://github.com/cloudai-x/threejs-skills)

[github.com/cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills)

[GitHub - CloudAI-X/threejs-skills](https://github.com/cloudai-x/threejs-skills)

[github.com/cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills)

[Three.js Skills — AI Agent Skill by CloudAI-X - AgenticSkills](https://agenticskills.io/skills/threejs-skills)

[agenticskills.io/skills/threejs-skills](https://agenticskills.io/skills/threejs-skills)

[GitHub - greensock/gsap-skills: Official AI skills for GSAP. These skills teach AI coding agents how to correctly use GSAP (GreenSock Animation Platform), including best practices, common animation patterns, and plugin usage.](https://github.com/greensock/gsap-skills)

[github.com/greensock/gsap-skills](https://github.com/greensock/gsap-skills)

Popular Development Tools Used

GSAP (GreenSock Animation Platform) / ScrollTrigger: The industry standard JavaScript library for complex scroll-driven web animations.

Framer Motion: A popular React animation library used for smooth interactive transitions.

Locomotive Scroll:

wha tare thes

These are JavaScript libraries used by frontend developers to build highly interactive, smooth, and cinematic web experiences. Here is a breakdown of what each one does:

- **GSAP (GreenSock Animation Platform) & ScrollTrigger:** This is a powerful, framework-agnostic animation engine used for complex, timeline-based sequences and orchestrating animations across many elements. It can animate standard web elements as well as WebGL or Three.js 3D graphics. The ScrollTrigger plugin specifically ties these animations to the user's scroll position, allowing you to trigger videos, 3D camera moves, or text reveals precisely as the user scrolls down the page.  


- **Framer Motion:** Often referred to simply as "Motion," this is an animation library built specifically for the React framework. It is heavily used for smooth UI transitions, micro-interactions, and handling how interface elements enter and exit the screen.  


- **Locomotive Scroll:** This is a smooth-scrolling library. Because native browser scrolling can be jittery depending on the user's mouse wheel or trackpad, libraries like Locomotive (or its highly popular modern alternative, Lenis) mathematically smooth out the scroll physics. This ensures that parallax effects and scroll-linked animations feel buttery smooth and premium, rather than stuttering.  



[GSAP Web Animation Skill for Developers | Get Claude Skills](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[getclaudeskills.com/skills/gsap-web-animation-mengto](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[gsap-skills/skills/gsap-core/SKILL.md at main - GitHub](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md)

[github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md)

[claudedesignskills/.claude/skills/gsap-scrolltrigger/SKILL.md at main · freshtechbro ... - GitHub](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md)

[github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md)

[GSAP Web Animation Skill for Developers | Get Claude Skills](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[getclaudeskills.com/skills/gsap-web-animation-mengto](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[DevMartinese/awwwards-animations-skill at explainx - GitHub](https://github.com/devmartinese/awwwards-animations-skill?ref=explainx)

[github.com/devmartinese/awwwards-animations-skill?ref=explainx](https://github.com/devmartinese/awwwards-animations-skill?ref=explainx)

find skills related to them

Here are the specific Claude skills you can download to automate workflows for those animation and scroll libraries:

**GSAP (GreenSock) & ScrollTrigger**

- **GSAP Core & ScrollTrigger:** You can use the official GSAP skills from the `greensock/gsap-skills` repository, which instruct Claude on core API tweens, timelines, and scroll-driven animations.  


- **FreshTechBro GSAP Skill:** The `freshtechbro/claudedesignskills` bundle includes a dedicated `gsap-scrolltrigger` plugin specifically for complex scroll pinning, parallax effects, and sequencing.  


- **GSAP Web Animation by Meng To:** This skill focuses heavily on high-quality UI motion, micro-interactions, and scroll-driven storytelling.  



**Framer Motion (now simply "Motion")**

- **Jezweb Motion (****`jezweb/claude-skills`****):** This skill is built to help Claude generate sophisticated React animations, including drag interactions, hover states, and spring physics, while optimizing for smaller bundle sizes.  


- **FreshTechBro Motion-Framer:** Available in the `freshtechbro/claudedesignskills` marketplace, this skill acts as a boilerplate generator for gesture animations and interactive UI components.  


- **OpenMontage Framer Motion:** This skill focuses on classic animation principles (like squash and stretch or anticipation) mapped to React code.  



**Locomotive Scroll & Lenis (Smooth Scrolling)**

- **Awwwards Animations Skill (****`devmartinese/awwwards-animations-skill`****):** If your goal is a cinematic portfolio, this is highly recommended. It explicitly teaches Claude how to integrate Lenis (the modern standard for smooth scrolling) alongside GSAP for scroll-linked effects and parallax.  


- **Extended 3D Scroll Bundle:** The `freshtechbro/claudedesignskills` plugin marketplace includes an `extended-3d-scroll` bundle that contains specific skills for working with Locomotive scroll and other specialized transition libraries.  



[gsap-skills/skills/gsap-core/SKILL.md at main - GitHub](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md)

[github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-core/SKILL.md)

[claudedesignskills/.claude/skills/gsap-scrolltrigger/SKILL.md at main · freshtechbro ... - GitHub](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md)

[github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/gsap-scrolltrigger/SKILL.md)

[GSAP Web Animation Skill for Developers | Get Claude Skills](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[getclaudeskills.com/skills/gsap-web-animation-mengto](https://www.getclaudeskills.com/skills/gsap-web-animation-mengto)

[Motion (Grade B) - Claude Skill - Skills Directory](https://www.skillsdirectory.com/skills/jezweb-motion)

[skillsdirectory.com/skills/jezweb-motion](https://www.skillsdirectory.com/skills/jezweb-motion)

[claudedesignskills/.claude/skills/motion-framer/SKILL.md at main · freshtechbro ... - GitHub](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/motion-framer/SKILL.md)

[github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/motion-framer/SKILL.md](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/motion-framer/SKILL.md)

find open sources website builds that are already built up like the ones i described, for reference

Gemini is AI and can make mistakes.