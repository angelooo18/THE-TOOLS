# KA$H — kash command & delegation tree reference

> Cheat sheet for the `kash` orchestrator setup: commands, session strategy,
> and the boss → leads → leaves tree with the anti phone-effect protocol.
> Constitution lives in `~/kash/AGENTS.md` (agents follow it automatically).

---

## The `kash` command

| Command | What it does | When to use |
|---|---|---|
| `kash` | Attaches to (or starts) **today's session** (`kash-YYYYMMDD`) | Default. Normal work — rotates automatically each day |
| `kash --new` | Brand-new anonymous session, no history | New unrelated task / work-stream |
| `kash --resume [id]` | Resumes a specific session (default: `kash-mimo`, the historical one) | Continue past work, e.g. `kash --resume kash-20260927` |

**Inside a session:**

| Slash command | Effect |
|---|---|
| `/boss-write` | Toggle the delegate-guard: lets (or blocks) the boss editing files directly |
| `/compact` | Force context compaction early (auto-fires near ~300K tokens anyway) |
| `/subagent <agent> <task>` | Spawn a subagent manually from the prompt box |

### Session strategy (context optimization)

Every Enter re-sends the **whole session history** to the model — bigger history
means slower starts, dumber answers, higher cost. So: **sessions are disposable,
the repo is the memory** (all deliverables live in files).

1. Just run `kash` — one session per day, continues within the day.
2. New task/phase → `kash --new` (one session per work-stream).
3. Old work → `kash --resume <id>` — or `kash --new` and say "read AGENTS.md
   and README, continue X": the files carry everything.
4. Feels slow/dumb → start fresh. Nothing is lost.

---

## The delegation tree — fixed depth 3, unlimited width

```
                          ┌────────────────────────────────────────┐
       user  ◄──────────► │  L1  BOSS  (main session)              │
                          │  decompose → briefs → dispatch →       │
                          │  VERIFY → conclude   (no write/edit —  │
                          │  delegate-guard; /boss-write to lift)  │
                          └───┬──────────────────────────────┬─────┘
                 brief A  ↓   │                              │  ↓  brief B
              (goal · exact paths · constraints ·            │  (self-contained · item 6:
               deliverable · out-of-scope · consult policy — │  "decide and deliver,
               VERBATIM — no shared memory exists)           │   don't consult" if short)
                              ▼                              ▼
              ┌───────────────────────────┐   ┌───────────────────────────┐
              │  L2 LEAD: coder           │   │  L2 LEAD: worker          │
              │  Pro · owns scope A       │   │  Pro · owns scope B       │
              │  integrates its own scope │   │  integrates its own scope │
              └──┬──────────┬─────────┬───┘   └──┬───────────┬────────────┘
                 │          │         │          │           │
                 ▼          ▼         ▼          ▼           ▼
              ┌───────┐ ┌────────┐ ┌───────┐ ┌────────┐ ┌──────────┐
              │ scout │ │research│ │helper │ │ helper │ │  vision  │  L3 LEAVES
              │ Flash │ │  Pro   │ │  Pro  │ │  Pro   │ │   Pro    │  never spawn,
              │ recon │ │  web   │ │ code  │ │  code  │ │ pixels/  │  disposable
              │read-on│ │        │ │  A1   │ │  B1    │ │ video/   │
              │+eviden│ │        │ │       │ │        │ │ audio    │
              └───┬───┘ └───┬────┘ └───┬───┘ └───┬────┘ └────┬─────┘
                  │         │          │         │           │
   report ↑ = CONCLUSIONS + FILE PATHS + RAW EVIDENCE (wc · stat · git · timestamps)
            + "what remains" — content lives in files, never relayed through layers
                  │         │          │         │           │
              ┌───┴─────────┴──────────┴─────────┴───────────┴───┐
              │  VERIFY GATE (every layer, before consuming):    │
              │  git diff · tests · read the file yourself       │
              │  mismatch → RE-DISPATCH with the discrepancy     │
              │  named in the brief (never silently patch it)    │
              └──────────────────────┬───────────────────────────┘
                                     │ one integrated report
                                     ▼
                          ┌──────────────────────┐
                          │  L1 VERIFY GATE →    │ → final conclusion to user
                          └──────────────────────┘

   ▼ down = briefs (complete · verbatim)     ▲ up = reports (lossless · file-backed)
   ask_question is RATIONED: only if the ambiguity materially changes the
   deliverable and can't be resolved by stating an assumption — short tasks
   never consult.   Width: unlimited (3–4 concurrent/parent) · Depth: FIXED 3
```

### Layers at a glance

| Layer | Agents | Role | May spawn |
|---|---|---|---|
| **L1 Boss** | main session | user contact · decompose · dispatch · verify · conclude | worker, coder, scout, researcher, vision, helper |
| **L2 Leads** | `worker` (general/analysis), `coder` (code) | implement · delegate heavy reads & parallel work | scout, researcher, vision, helper |
| **L3 Leaves** | `scout` (recon + evidence, **Flash**, read-only), `researcher` (web), `vision` (pixels/video/audio), `helper` (parallel code) | focused delivery, disposable | — (never spawn) |

- Delegation flows **strictly downward** — leads never spawn leads, nobody
  spawns itself. More work ⇒ more **width** (parallel children), never more depth.
- Practical concurrency: **3–4 children per parent** (more gets throttled).

### Why the phone effect can't happen

1. **Briefs can't garble** — task texts are self-contained and verbatim
   (goal / paths / constraints / deliverable / out-of-scope). Children share
   zero memory.
2. **Reports can't garble** — messages carry conclusions + file paths only;
   content lives in files and copies byte-exact. No lossy relay chains.
3. **Errors can't propagate** — verify gate at every layer (a report states
   intent, not result); mismatches get re-dispatched with the discrepancy named.
4. **Max 2 handoff hops** — depth is fixed at 3, period.

---

## Models & modalities (MiMo V2.6)

- **Pro and Flash are omni-modal: text, image, video, audio** (official spec).
- pi attaches text + images natively; video/audio enter via extraction
  (ffmpeg frames / transcription) — the `vision` agent owns that pipeline.
- Pro ≈ 3× Flash cost. Flash = cheap recon (scout). Pro = everything where
  reasoning quality matters. Thinking effort is not differentiated on MiMo.

## Boss guard (delegate-guard)

- The boss session **cannot** `edit` files, and can only `write` briefs under
  `context/` — implementation must be delegated to leads. First run: accept the
  project-trust prompt so the extension loads.
- `/boss-write` toggles the override when you want direct edits.
- Subagent panes are unaffected — leads/helpers edit normally.
