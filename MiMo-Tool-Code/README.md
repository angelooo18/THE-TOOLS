# MiMo-Tool-Code

A hardened **boss → leads → leaves** orchestration workspace for [pi](https://github.com/earendil-works/pi),
tuned for Xiaomi **MiMo V2.6** models. The orchestrator plans and verifies;
implementation happens in disposable subagent trees. The boss is *physically
prevented* from writing code — a delegate-guard extension blocks it.

## What's in the box

| Piece | What it does |
|---|---|
| **Tree protocol** (`AGENTS.md`) | Strict downward delegation: L1 boss → L2 leads (`worker`, `coder`, `implementer`) → L3 leaves (`scout`, `researcher`, `vision`, `helper`). Fixed depth 3, unlimited width |
| **delegate-guard** (extension) | Hard enforcement: the boss session cannot `edit` or `write` outside `context/`. `/boss-write` lifts it explicitly |
| **Fork inheritance** | The `implementer` lead runs `session-mode: fork` — it inherits the boss's full planning context for plan-heavy work ("why" beats "what") |
| **Amnesiac briefs** | Parallel/scoped work goes to self-contained, verbatim briefs (goal · paths · constraints · deliverable · out-of-scope · consultation policy) — zero shared memory by design |
| **Verify gates** | Every layer verifies with raw evidence (`git diff`, tests, timestamps) before consuming a child's report. Mismatch → re-dispatch with the discrepancy named |
| **Anti phone-effect** | Reports carry conclusions + file paths only; content lives in files and never gets relayed through layers |
| **Observational memory** | Optional [pi-observational-memory](https://github.com/amosblomqvist/pi-observational-memory) config keeps the boss's context crisp indefinitely |
| **Session hygiene** | The `kash` launcher rotates sessions daily, auto-compacts near 300K tokens, `kash --resume` revisits old work |

## Requirements

- [pi](https://github.com/earendil-works/pi) ≥ 0.99.2 (`pi update self`)
- tmux (subagent panes and fork spawns require it)
- A Xiaomi MiMo API key (`pi auth` / `~/.pi/agent/auth.json`)
- Packages:
  ```
  pi install git:github.com/amosblomqvist/pi-interactive-subagents
  pi install git:github.com/amosblomqvist/pi-observational-memory
  ```

## Install

```bash
# 1. Workspace config into your project (creates .pi/ + AGENTS.md)
cp -r project/.pi  /path/to/your/project/
cp project/AGENTS.md /path/to/your/project/

# 2. Launcher
cp launchers/kash ~/.local/bin/kash && chmod +x ~/.local/bin/kash
#    (edit KASH_PROJECT inside to point at your project)

# 3. Trust the project when pi asks (that's what activates delegate-guard)
# 4. Optional memory: run /om on in the boss session
```

## Usage

```bash
kash                # today's session (rotates daily)
kash --new          # fresh session for a new work-stream
kash --resume [id]  # revisit an old session (default: kash-mimo)
```

Inside the session: `/boss-write` (lift the guard), `/compact` (force
compaction), `/om on` (enable observational memory), `/subagent <agent> <task>`
(spawn manually).

## Model routing

Both MiMo V2.6 Pro and Flash are omni-modal (text, image, video, audio). Route
on cost/capability: **Flash** (`scout`) for high-volume recon, **Pro** for
implementation, analysis and anything where reasoning quality matters. MiMo
does not differentiate thinking-effort levels — `high` everywhere.

## Docs

- `docs/kash-commands-and-tree.md` — command + topology cheat sheet
- `docs/KASH-workflow-mermaid.md` — Mermaid flow diagram (comms + loops)

## Credits

- Subagent engine: [pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents) by Amos Blomqvist
- Memory engine: [pi-observational-memory](https://github.com/amosblomqvist/pi-observational-memory) by Amos Blomqvist
- Harness: [pi](https://github.com/earendil-works/pi) by earendil-works
- Models: Xiaomi MiMo V2.6

## License

MIT
