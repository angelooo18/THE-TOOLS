/**
 * Delegate Guard — hard enforcement of the KA$H tree protocol (AGENTS.md).
 *
 * In the BOSS (orchestrator) session this extension blocks `edit` entirely and
 * `write` outside `context/`, so implementation physically has to happen in
 * subagents (worker/coder leads). Subagent sessions are unaffected — leads need
 * write/edit to do their job.
 *
 * Escape hatch: `/boss-write` toggles the guard off for the current session
 * when the user explicitly wants the boss to edit directly.
 *
 * Guarded:  boss session (no PI_SUBAGENT_AGENT)
 * Skipped:  subagent sessions (PI_SUBAGENT_AGENT set by pi-interactive-subagents)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const GUARD_REASON =
	"BOSS SESSION — direct file changes are disabled by delegate-guard. " +
	"Implementation happens in subagents: dispatch a lead with the subagent tool, " +
	"e.g. subagent({ agent: \"worker\", task: \"…\" }) or agent: \"coder\". " +
	"If the user explicitly asked you to edit files yourself, run /boss-write to lift the guard.";

function isBossSession(): boolean {
	// pi-interactive-subagents sets PI_SUBAGENT_AGENT in every child pane.
	return !process.env.PI_SUBAGENT_AGENT;
}

function isBriefPath(path: string): boolean {
	// The only files the boss may create directly: handoff briefs under context/.
	const normalized = path.replace(/\\/g, "/");
	return (
		normalized.startsWith("context/") ||
		normalized.includes("/context/") ||
		normalized.startsWith("./context/")
	);
}

export default function (pi: ExtensionAPI) {
	let guardEnabled = true;

	pi.on("tool_call", async (event, ctx) => {
		if (!guardEnabled) return undefined;
		if (!isBossSession()) return undefined;
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const path = String((event.input as { path?: unknown }).path ?? "");

		if (event.toolName === "edit") {
			if (ctx.hasUI) ctx.ui.notify("delegate-guard: edit blocked — delegate to a lead", "warning");
			return { block: true, reason: GUARD_REASON };
		}

		// write: only briefs under context/ are allowed
		if (!isBriefPath(path)) {
			if (ctx.hasUI) ctx.ui.notify(`delegate-guard: write blocked (${path}) — delegate to a lead`, "warning");
			return { block: true, reason: GUARD_REASON };
		}

		return undefined;
	});

	pi.registerCommand("boss-write", {
		description: "Toggle direct write/edit in the boss session (delegate-guard on/off)",
		handler: async (_args, ctx) => {
			guardEnabled = !guardEnabled;
			ctx.ui.notify(
				`delegate-guard: direct write/edit ${guardEnabled ? "BLOCKED (delegation enforced)" : "ALLOWED (override)"}`,
				"info",
			);
		},
	});
}
