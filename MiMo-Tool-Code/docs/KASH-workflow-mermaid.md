---
tags:
  - kash
  - workflow
  - mermaid
---

# KASH workflow — flow diagram (Mermaid)

> Final state of the boss → leads → leaves tree with fork inheritance,
> observational memory, comms (C#) and loops (R#). Companion:
> `~/Desktop/kash-commands-and-tree.md`.

## Flow

```mermaid
flowchart TD
    USER(["USER 👤"])

    subgraph L1["L1 · BOSS"]
        BOSS["decompose · dispatch · verify · conclude<br/>🔒 delegate-guard: NO edit/write<br/>/boss-write · /compact · /om on"]
    end

    GATE{"DISPATCH<br/>GATE"}

    subgraph L2["L2 · LEADS"]
        IMPL["implementer · session-mode: fork<br/>inherits 100% of boss context"]
        CW["coder / worker<br/>amnesiac + verbatim brief"]
    end

    subgraph L3["L3 · LEAVES"]
        SCOUT["scout · Flash · read-only + evidence"]
        RESEARCH["researcher · web"]
        VISION["vision · pixels / video / audio"]
        HELPER["helper ×N · parallel code"]
    end

    VERIFY{"VERIFY GATE · every layer<br/>git diff · tests · wc / stat / timestamps"}

    subgraph MEM["R3 · MEMORY"]
        OBS["observers · Flash ×4 · parallel"] --> LEDGER["ledger · branch-local"]
        LEDGER --> COMPACT["compaction @150K · verbatim"]
        COMPACT --> MEMFILES[".memory/session/ topics + JOURNEY.md"]
    end

    FILES[("FILES = shared memory<br/>reports/ · docs/ · analysis/")]

    USER -->|"C1 request"| BOSS
    BOSS -->|"C1 conclusion"| USER
    BOSS -.->|"C2 escalate unanswerable"| USER
    USER -.->|"C2 decide"| BOSS
    BOSS --> GATE
    GATE -->|"C3 fork · inherited context"| IMPL
    GATE -->|"C4 brief · self-contained"| CW
    IMPL -->|"C5 spawn"| L3
    CW -->|"C5 spawn"| L3
    L3 -->|"C6 report up · conclusions + paths + raw evidence"| VERIFY
    IMPL --> VERIFY
    CW --> VERIFY
    VERIFY -->|"R1 mismatch → re-dispatch · discrepancy NAMED"| GATE
    VERIFY -->|"verified · integrate"| BOSS
    BOSS -.->|"R2 / C7 steer + answers · rationed"| L3
    L3 -.->|"R2 ask_question · parks child"| BOSS
    BOSS -->|"raw turns"| MEM
    MEMFILES -.->|"R3 crisp context + memory map"| BOSS
    IMPL -.->|"R4 dies after report"| FILES
    L3 -.->|"R4 dies after report"| FILES
    MEMFILES -.-> FILES

    classDef human fill:#e1f5fe,stroke:#0288d1,color:#000
    classDef boss fill:#fff59d,stroke:#f9a825,color:#000
    classDef lead fill:#fff3e0,stroke:#fb8c00,color:#000
    classDef leaf fill:#e8f5e9,stroke:#43a047,color:#000
    classDef gate fill:#ffe0b2,stroke:#ef6c00,color:#000
    classDef mem fill:#f3e5f5,stroke:#8e24aa,color:#000

    class USER human
    class BOSS boss
    class IMPL,CW lead
    class SCOUT,RESEARCH,VISION,HELPER leaf
    class GATE,VERIFY gate
    class OBS,LEDGER,COMPACT,MEMFILES,FILES mem
```

## Channels (comms)

| # | Channel | Direction | Nature |
|---|---|---|---|
| C1 | user ↔ boss | ↔ | interactive chat — the only human channel |
| C2 | escalation | boss ↔ user | unanswerable questions routed up, never guessed |
| C3 | fork inheritance | boss → implementer | 100% of built-up context, one hop only |
| C4 | brief | boss/lead → child | verbatim, self-contained (goal · paths · constraints · deliverable · out-of-scope · consult policy) |
| C5 | spawn | parent → child | `subagent` tool, fire-and-forget |
| C6 | report | child → parent | conclusions + file paths + raw evidence + "what remains" |
| C7 | steering / answers | parent → child | `subagent_message` — wakes parked children |
| C8 | files | ↔ all layers | the shared memory — content never relayed through messages |

## Loops

| # | Loop | What it catches |
|---|---|---|
| R1 | verify → re-dispatch | wrong/unverified results — killed at the layer below |
| R2 | ask/answer (rationed) | ambiguity — parked child wakes on reply; short tasks never consult |
| R3 | observers → ledger → compaction → .memory | context rot — boss stays crisp indefinitely |
| R4 | spawn → work → report → die → continue | context pollution — implementation never contaminates the boss |

**Constraints:** width unlimited (3–4 concurrent per parent) · depth FIXED at 3 ·
delegation strictly downward (hard-enforced: self-spawn and lead→lead blocked).
