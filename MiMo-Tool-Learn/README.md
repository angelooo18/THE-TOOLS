# MiMo-Tool-Learn

**learn-studio** — a personal learning workspace for [pi](https://github.com/earendil-works/pi),
tuned for Xiaomi **MiMo V2.6** models. Learn any topic with a tutor that
*teaches for understanding* (not memorization), renders math + diagrams into an
Obsidian vault, quizzes you, and — with observational memory enabled — remembers
where you left off, what clicked and what didn't.

Built on Amos Blomqvist's [learn](https://github.com/amosblomqvist/learn) system,
switched to fully-MiMo and extended with cross-session memory.

## What's in the box

| Piece | What it does |
|---|---|
| **`teach` skill** | Two teaching principles (unconditional truths first; connect every fact) applied to every explanation — understanding over memorization |
| **`visualize` skill** + **visual-tools** | Mermaid + SVG generation via `mermaid-maker` / `svg-maker` subagents |
| **`quiz`** extension | Active-recall testing inside the session |
| **`md-log`** extension | Streams lessons into `lessons/<tema>.md` — Obsidian renders LaTeX + Mermaid natively (pi doesn't render math; Obsidian is the viewer) |
| **MiMo routing** | Tutor + subagents on `xiaomi/mimo-v2.6-pro` (thinking `high`); project defaults in `.pi/settings.json` |
| **Observational memory** | Optional [pi-observational-memory](https://github.com/amosblomqvist/pi-observational-memory): a `JOURNEY.md` study narrative + topic files per session. The tutor resumes at your level; misconceptions persist across sessions; long lessons stay crisp |

## Requirements

- [pi](https://github.com/earendil-works/pi) ≥ 0.99.2 (`pi update self`)
- tmux (the subagents require pi inside tmux)
- Obsidian (as the lesson viewer — open `~/learning` as vault)
- A Xiaomi MiMo API key (`pi auth` / `~/.pi/agent/auth.json`)
- Package (for subagents + memory):
  ```
  pi install git:github.com/amosblomqvist/pi-interactive-subagents
  pi install git:github.com/amosblomqvist/pi-observational-memory
  ```

## Install

```bash
# Bootstrap installs/repairs everything (idempotent):
./bootstrap.sh                # default project dir: ~/learning
# or: ./bootstrap.sh --project-dir /path/to/learning

# Manual equivalent:
cp -r project/.pi /path/to/learning/        # skills, agents, extensions, settings
cp learn-format.md ~/.pi/agent/             # LaTeX lesson-format reinforcement
cp launchers/learn launchers/learn-studio ~/.local/bin/
cp -r global-extensions/* ~/.pi/agent/extensions/
cd <extensions dirs with package.json> && npm install
```

## Usage

```bash
learn-studio        # pi (tmux) + Obsidian, tiled — Super+← / Super+→ to split
learn               # pi in tmux with the teach skill always on
learn "Enseñame cómo funcionan los sockets"
learn --plain       # without tmux (subagents unavailable, everything else works)
```

Then in the session:

1. Create the lesson file (`touch lessons/<tema>.md`), link it: `/md-log ~/learning/lessons/<tema>.md`
2. `/om on` — enable observational memory (optional but recommended)
3. Ask to be taught anything.

### The study pattern (memory-aware)

```
learn "tema"            → course master session · /om on · theory + journey
   ├─ fork for exercises/quiz → inherits theory, memory seeded, dies after
   └─ researcher / mermaid-maker / svg-maker subagents as needed
lessons/<tema>.md       → md-log: durable lesson artifacts (the vault)
.memory/<sid>/          → OM: journey + topics + weak-point observations
```

Notes on memory: OM is **per session** (`.memory/<sessionId>/`) — cross-session
continuity comes from the master/fork discipline (forks seed memory from their
parent). `JOURNEY.md` is *orientation*, not spaced repetition — pair it with the
quiz extension and your vault notes for retention.

## Structure

```
bootstrap.sh            installer / repair (idempotent)
launchers/              learn, learn-studio (+ .desktop files)
global-extensions/      custom-header, web-fetch, web-search
project/.pi/            settings.json (MiMo + OM), agents/, skills/, extensions/
learn-format.md         LaTeX lesson-format reinforcement (global prompt file)
docs/                   AGENTS example, format reference, notes
```

## Credits

- Original `learn` system, `teach`/`visualize` skills and the subagent engine:
  [Amos Blomqvist](https://github.com/amosblomqvist) — [learn](https://github.com/amosblomqvist/learn),
  [pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents),
  [pi-observational-memory](https://github.com/amosblomqvist/pi-observational-memory)
- Harness: [pi](https://github.com/earendil-works/pi) by earendil-works
- Models: Xiaomi MiMo V2.6

## License

MIT
