import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@mariozechner/pi-tui";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface StructuredSearchArgs {
	query?: string;
	exactPhrases?: string[];
	excludeTerms?: string[];
	site?: string;
	count?: number;
}

interface BuiltSearchQuery {
	query: string;
	baseQuery?: string;
	exactPhrases: string[];
	excludeTerms: string[];
	site?: string;
}

const EXT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DDG_SCRIPT = path.join(EXT_DIR, "scripts", "ddg_search.py");
const DEEPSEEK_SCRIPT = path.join(EXT_DIR, "scripts", "deepseek_search.py");
/** Búsqueda nativa de DeepSeek (server tool web_search_20250305, vía el harness oficial). */
async function deepseekSearch(query: string, count: number): Promise<SearchResult[]> {
	const { stdout } = await execFileAsync(
		"python3",
		[DEEPSEEK_SCRIPT, query, String(count)],
		{ timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
	);
	const parsed = JSON.parse(stdout) as Array<{
		title: string;
		url: string;
		snippet: string;
	}>;
	if (!Array.isArray(parsed)) throw new Error("DeepSeek: respuesta inesperada");
	return parsed.map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.snippet?.replace(/\n/g, " ") ?? "",
	}));
}

/** Búsqueda local vía DuckDuckGo (sin API key, sin coste). */
async function ddgSearch(query: string, count: number): Promise<SearchResult[]> {
	const { stdout } = await execFileAsync(
		"python3",
		[DDG_SCRIPT, query, String(count)],
		{ timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
	);
	const parsed = JSON.parse(stdout) as Array<{
		title: string;
		url: string;
		snippet: string;
	}>;
	if (!Array.isArray(parsed)) throw new Error("DuckDuckGo: respuesta inesperada");
	return parsed.map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.snippet?.replace(/\n/g, " ") ?? "",
	}));
}

function buildDetails(built: BuiltSearchQuery, resultCount: number, provider: string) {
	return {
		composedQuery: built.query,
		query: built.baseQuery,
		exactPhrases: built.exactPhrases,
		excludeTerms: built.excludeTerms,
		site: built.site,
		resultCount,
		provider,
	};
}

function formatResults(results: SearchResult[], provider?: string): string {
	if (results.length === 0) return "No results found.";
	const header = provider ? `[provider: ${provider}]\n\n` : "";
	return header + results
		.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
		.join("\n\n");
}

function stripWrappingQuotes(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1).trim()
		: value;
}

function cleanItems(values?: string[]): string[] {
	if (!values) return [];
	return values
		.map((value) => stripWrappingQuotes(value.trim().replace(/\s+/g, " ")))
		.filter(Boolean);
}

function cleanQuery(value?: string): string | undefined {
	if (typeof value !== "string") return undefined;
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned || undefined;
}

function normalizeSite(site?: string): string | undefined {
	if (typeof site !== "string") return undefined;

	let value = site.trim().replace(/^site:/i, "").trim();
	if (!value) return undefined;

	try {
		const candidate = /^[a-z]+:\/\//i.test(value)
			? value
			: `https://${value}`;
		const url = new URL(candidate);
		if (url.hostname) value = url.hostname;
	} catch {}

	return value.replace(/\/+$/, "") || undefined;
}

function quoteForSearch(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

function buildSearchQuery(args: StructuredSearchArgs): BuiltSearchQuery {
	const baseQuery = cleanQuery(args.query);
	const exactPhrases = cleanItems(args.exactPhrases);
	const excludeTerms = cleanItems(args.excludeTerms);
	const site = normalizeSite(args.site);

	if (!baseQuery && exactPhrases.length === 0) {
		throw new Error(
			"At least one of 'query' or 'exactPhrases' is required.",
		);
	}

	const parts: string[] = [];
	if (baseQuery) parts.push(baseQuery);
	for (const phrase of exactPhrases) {
		parts.push(quoteForSearch(phrase));
	}
	for (const term of excludeTerms) {
		parts.push(`-${term.includes(" ") ? quoteForSearch(term) : term}`);
	}
	if (site) {
		parts.push(`site:${site}`);
	}

	return {
		query: parts.join(" "),
		baseQuery,
		exactPhrases,
		excludeTerms,
		site,
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web via DeepSeek's native web search (server tool web_search_20250305 on the Anthropic-compatible Messages API, misma API key de DeepSeek), igual que el harness oficial v0.1.6-alpha.1. Fallback: DuckDuckGo local (sin API key). Build one search per call from a base query string, exact phrases, exclusions, and an optional site. Returns title, URL, and snippet.",
		promptSnippet:
			"Search the web via a query string plus optional exactPhrases, excludeTerms, and site. Use one tool call per search angle.",
		promptGuidelines: [
			"Use exactPhrases for exact phrase matching instead of embedding quote marks inside the main query string.",
			"Use one web_search tool call per search angle instead of batching multiple searches into one call.",
		],

		parameters: Type.Object({
			query: Type.Optional(
				Type.String({
					description:
						"Base search query as a normal string. Prefer this for the main search wording.",
				}),
			),
			exactPhrases: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Exact phrases to match. Each item becomes a quoted phrase in the final search query.",
				}),
			),
			excludeTerms: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Terms or phrases to exclude. Multi-word items are excluded as exact phrases.",
				}),
			),
			site: Type.Optional(
				Type.String({
					description:
						"Optional site/domain restriction, such as example.com or a full URL.",
				}),
			),
			count: Type.Optional(
				Type.Number({
					description: "Number of results to return (default: 5, max: 10)",
					minimum: 1,
					maximum: 10,
				}),
			),
		}),

		async execute(_toolCallId, params: StructuredSearchArgs, signal) {
			const count = params.count ?? 5;
			const built = buildSearchQuery(params);
			const providers: Array<{
				name: string;
				run: () => Promise<SearchResult[]>;
			}> = [
				// Proveedor principal: DeepSeek nativo (server tool web_search_20250305
				// vía Messages API), igual que el harness oficial v0.1.6-alpha.1.
				// Si falla o da 0, cae el respaldo DuckDuckGo (no necesita API key).
				{ name: "DeepSeek nativo", run: () => deepseekSearch(built.query, count) },
				{ name: "DuckDuckGo", run: () => ddgSearch(built.query, count) },
			];

			let lastError: string | undefined;
			for (const provider of providers) {
				try {
					const results = await provider.run();
					if (results.length > 0) {
						return {
							content: [{ type: "text" as const, text: formatResults(results, provider.name) }],
							details: buildDetails(built, results.length, provider.name),
						};
					}
				} catch (error) {
					lastError = error instanceof Error ? error.message : String(error);
				}
			}

			throw new Error(
				`No se pudo buscar (${lastError ?? "ningún proveedor devolvió resultados"}).`,
			);
		},

		renderCall(args, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);
			const { count, ...searchArgs } = args as StructuredSearchArgs;

			try {
				const built = buildSearchQuery(searchArgs);
				const display =
					built.query.length > 70
						? built.query.slice(0, 67) + "..."
						: built.query;
				const lines = [
					theme.fg("toolTitle", theme.bold("search ")) +
						theme.fg("accent", `"${display}"`),
				];
				if (count && count !== 5) {
					lines.push(theme.fg("dim", `  count: ${count}`));
				}
				text.setText(lines.join("\n"));
				return text;
			} catch {
				text.setText(
					theme.fg("toolTitle", theme.bold("search ")) +
						theme.fg("error", "(invalid query)"),
				);
				return text;
			}
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);

			if (isPartial) {
				text.setText(theme.fg("warning", "Searching…"));
				return text;
			}

			if (context.isError) {
				const msg =
					result.content.find((c) => c.type === "text")?.text ||
					"Error";
				text.setText(theme.fg("error", msg));
				return text;
			}

			const details = result.details as {
				composedQuery?: string;
				resultCount?: number;
				provider?: string;
			};
			const provider = details?.provider ? ` · ${details.provider}` : "";
			const status = theme.fg(
				"success",
				`${details?.resultCount ?? 0} results${provider}`,
			);
			if (!expanded) {
				text.setText(status);
				return text;
			}

			const content =
				result.content.find((c) => c.type === "text")?.text || "";
			const preview =
				content.length > 500 ? content.slice(0, 500) + "..." : content;
			const queryLine = details?.composedQuery
				? theme.fg("dim", `query: ${details.composedQuery}`)
				: "";
			text.setText(
				[status, queryLine, theme.fg("dim", preview)]
					.filter(Boolean)
					.join("\n"),
			);
			return text;
		},
	});
}
