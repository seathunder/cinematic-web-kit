# Installing the skill

Claude Code loads skills from `~/.claude/skills/<name>/`. This folder is a copy kept inside the repo so
the repo is self-contained; to make it active, copy it into place.

## Install

Windows:

```bash
cp -r skill "$USERPROFILE/.claude/skills/cinematic-web"
```

macOS / Linux:

```bash
cp -r skill ~/.claude/skills/cinematic-web
```

The destination folder **must** be named `cinematic-web` — it has to match the `name:` field in
`SKILL.md`'s frontmatter.

Then start a new Claude Code session (skills are read at startup) and invoke it with
`/cinematic-web`, or just describe a cinematic-site task and it will load on its own.

`INSTALL.md` is harmless to leave in the installed copy.

## One thing to check after installing

`SKILL.md` line 15 declares where the toolkit lives:

```
C:\Users\HP\Desktop\cinematic-web-kit\toolkit\
```

**If you moved or renamed this repository, edit that line.** Everything else in the skill cites
`toolkit/...` relative to it, so one wrong path there makes every source citation unresolvable — and
Absolute Rule 2 ("read the source before writing an API call") stops working, which is exactly the
condition that produced invented API signatures four times during this project.

## What is in here

`SKILL.md` is a router — absolute rules, the ten laws, four decision tables, the 22-stage loop, and a
"where to look" table. It stays small on purpose. The depth is in `references/`:

| file | for |
|---|---|
| `architecture.md` | how the system fits together, and why |
| `kernel-api.md` | all 14 kernel units, signatures transcribed from source |
| `modules-api.md` | all 11 modules, signatures transcribed from source |
| `syntax.md` | TypeScript, GLSL, HTML, CSS conventions |
| `art-direction.md` | lens, light, colour, type, sound, pacing |
| `design-thinking.md` | screenplay-first planning, archetypes, client intake |
| `fullstack.md` | toolchain, asset pipeline, budgets, a11y, deployment |
| `recipes.md` | 15 working recipes, one per renderer kind and pattern |
| `troubleshooting.md` | symptom to cause to fix |
| `business.md` | tiers, pricing, licensing, delivery checklist |

Load one at a time. Loading all ten defeats the point.

## After editing any skill file

```bash
python tools/check_skill_links.py
```

It verifies every path reference resolves and every bare unit name maps to a real toolkit file. The
paths at the top of that script assume the skill is at `~/.claude/skills/cinematic-web` and the toolkit
at the location above — adjust them if your layout differs.
