import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@mariozechner/pi-tui";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MIN_USEFUL_CONTENT = 500;
const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_TIMEOUT_MS = 30000;

// ── DSH-parity network policy ───────────────────────────────────────
// Ported from deepseek-harness v0.1.6-alpha.1 packages/web/web-fetch-http
// (policy.ts + network.ts): public-address resolution over a pinned
// connection, same-origin redirects only, DSH response limits.

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const MAX_BODY_CHARS = 100_000;

interface PublicAddress {
	address: string;
	family: 4 | 6;
}

type PolicyResponse = Awaited<ReturnType<typeof undiciFetch>>;

/** Policy refusal: no provider fallback may bypass it. */
class FetchPolicyError extends Error {}

function stripIpv6Brackets(hostname: string): string {
	return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** Globally reachable unicast check, mirroring DSH's ipaddr.js ranges. */
function isPublicIpAddress(input: string): boolean {
	let parsed: ipaddr.IPv4 | ipaddr.IPv6;
	try {
		parsed = ipaddr.parse(stripIpv6Brackets(input));
	} catch {
		return false;
	}
	if (parsed instanceof ipaddr.IPv4) return parsed.range() === "unicast";
	if (parsed.isIPv4MappedAddress()) return parsed.toIPv4Address().range() === "unicast";
	// NAT64 well-known prefix 64:ff9b::/96: judge the embedded IPv4 target.
	const bytes = parsed.toByteArray();
	if (
		bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b &&
		bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0 &&
		bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 0
	) {
		return isPublicIpAddress(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
	}
	return parsed.range() === "unicast";
}

/** Resolve once and refuse the whole answer set if any address is non-public. */
async function resolvePublicAddresses(hostname: string, signal?: AbortSignal): Promise<PublicAddress[]> {
	const host = stripIpv6Brackets(hostname);
	const literalFamily = isIP(host);
	let resolved: Array<{ address: string; family: number }>;
	if (literalFamily !== 0) {
		resolved = [{ address: host, family: literalFamily }];
	} else {
		try {
			resolved = await dnsLookup(host, { all: true, verbatim: true });
		} catch (error) {
			throw new Error(`could not resolve hostname "${hostname}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (resolved.length === 0) throw new FetchPolicyError(`hostname "${hostname}" resolved to no addresses`);
	const addresses: PublicAddress[] = [];
	for (const entry of resolved) {
		if ((entry.family !== 4 && entry.family !== 6) || isIP(entry.address) !== entry.family) {
			throw new FetchPolicyError(`hostname "${hostname}" resolved to an invalid IP address`);
		}
		if (!isPublicIpAddress(entry.address)) {
			throw new FetchPolicyError(`URL hostname "${hostname}" resolves to a non-public IP address; request blocked`);
		}
		if (signal?.aborted) throw new Error("web fetch aborted during hostname resolution");
		addresses.push({ address: entry.address, family: entry.family });
	}
	return addresses;
}

/** Connector lookup serving only the already validated address set. */
function pinnedLookup(addresses: PublicAddress[]) {
	return (
		hostname: string,
		options: { family?: number | string; all?: boolean },
		callback: (error: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
	): void => {
		const family = typeof options.family === "number"
			? options.family
			: options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : 0;
		const eligible = family === 0 ? addresses : addresses.filter((entry) => entry.family === family);
		const selected = eligible[0];
		if (selected === undefined) {
			callback(
				Object.assign(new Error(`no validated address for ${hostname} in family ${family}`), { code: "ENOTFOUND", hostname }),
				options.all === true ? [] : "",
				family,
			);
			return;
		}
		if (options.all === true) {
			callback(null, eligible.map((entry) => ({ ...entry })));
			return;
		}
		callback(null, selected.address, selected.family);
	};
}

/** DSH fetch policy: <=2048 chars, http(s) only, no embedded credentials. */
function validateFetchUrl(input: string): URL {
	if (input.length > MAX_URL_LENGTH) throw new FetchPolicyError(`URL exceeds the maximum length of ${MAX_URL_LENGTH}`);
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new FetchPolicyError(`invalid URL: ${input}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new FetchPolicyError(`unsupported URL scheme "${url.protocol}" (only http and https are allowed)`);
	}
	if (url.username.length > 0 || url.password.length > 0) {
		throw new FetchPolicyError("credentials in URLs are not allowed");
	}
	return url;
}

function isSameOrigin(a: URL, b: URL): boolean {
	return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}

function isRedirectStatus(status: number): boolean {
	return status >= 300 && status < 400 && status !== 304;
}

/** Fetch with address pinning and same-origin redirect following. */
async function fetchWithPolicy(
	input: string,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<{ response: PolicyResponse; finalUrl: URL; close: () => Promise<void> }> {
	let currentUrl = validateFetchUrl(input);
	let redirects = 0;
	for (;;) {
		const addresses = await resolvePublicAddresses(currentUrl.hostname, signal);
		const dispatcher = new Agent({ autoSelectFamily: true, connect: { lookup: pinnedLookup(addresses) } });
		let response: PolicyResponse;
		try {
			response = await undiciFetch(currentUrl, { method: "GET", redirect: "manual", headers, signal, dispatcher });
		} catch (error) {
			await dispatcher.close();
			throw error;
		}
		if (isRedirectStatus(response.status)) {
			try {
				if (redirects >= MAX_REDIRECTS) throw new FetchPolicyError(`exceeded the maximum of ${MAX_REDIRECTS} redirects`);
				const location = response.headers.get("location");
				if (location === null) throw new FetchPolicyError(`redirect response (HTTP ${response.status}) without a Location header`);
				const target = new URL(location, currentUrl);
				const validated = validateFetchUrl(target.toString());
				if (!isSameOrigin(validated, currentUrl)) {
					throw new FetchPolicyError(`cross-origin redirect to ${validated.origin} is not followed automatically; retry against that URL directly`);
				}
				currentUrl = validated;
				redirects++;
			} finally {
				await response.body?.cancel().catch(() => undefined);
				await dispatcher.close();
			}
			continue;
		}
		return { response, finalUrl: currentUrl, close: () => dispatcher.close() };
	}
}

/** Read at most maxBytes from the response stream (over-cap streams truncate). */
async function readCappedBytes(response: PolicyResponse, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
	if (signal?.aborted) throw new Error("web fetch aborted");
	if (response.body === null) return new Uint8Array(0);
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined) continue;
			const remaining = maxBytes - total;
			if (value.byteLength > remaining) {
				if (remaining > 0) {
					chunks.push(value.subarray(0, remaining));
					total += remaining;
				}
				break;
			}
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

function parseCharset(contentType: string | null): string | undefined {
	const match = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType ?? "");
	return match?.[1]?.trim().toLowerCase();
}

/** Decode with the declared charset; fail loudly on an unknown label. */
function decodeBody(bytes: Uint8Array, contentType: string | null): string {
	const charset = parseCharset(contentType);
	if (charset === undefined) return new TextDecoder("utf-8").decode(bytes);
	try {
		return new TextDecoder(charset).decode(bytes);
	} catch {
		throw new Error(`unsupported charset "${charset}"`);
	}
}

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
});

// ── Types ────────────────────────────────────────────────────────────

interface FetchResult {
	url: string;
	title: string;
	content: string;
	error: string | null;
	/** Set when the DSH network policy refused the request (no Jina fallback). */
	blocked?: boolean;
}

// ── PDF Extraction ───────────────────────────────────────────────────

function isPDF(url: string, contentType?: string): boolean {
	if (contentType?.includes("application/pdf")) return true;
	try {
		return new URL(url).pathname.toLowerCase().endsWith(".pdf");
	} catch {
		return false;
	}
}

async function extractPDF(
	buffer: ArrayBuffer,
	url: string,
): Promise<FetchResult> {
	const { getDocumentProxy } = await import("unpdf");
	const pdf = await getDocumentProxy(new Uint8Array(buffer));

	const metadata = await pdf.getMetadata();
	const metadataInfo =
		metadata.info && typeof metadata.info === "object"
			? (metadata.info as Record<string, unknown>)
			: null;

	const metaTitle =
		typeof metadataInfo?.Title === "string"
			? metadataInfo.Title.trim()
			: "";
	const metaAuthor =
		typeof metadataInfo?.Author === "string"
			? metadataInfo.Author.trim()
			: "";

	let urlTitle = "document";
	try {
		const { basename } = await import("node:path");
		urlTitle =
			basename(new URL(url).pathname, ".pdf")
				.replace(/[_-]+/g, " ")
				.trim() || "document";
	} catch {
		/* ignore */
	}
	const title = metaTitle || urlTitle;

	const maxPages = Math.min(pdf.numPages, 100);
	const pages: string[] = [];
	for (let i = 1; i <= maxPages; i++) {
		const page = await pdf.getPage(i);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item: unknown) => (item as { str?: string }).str || "")
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (pageText) pages.push(pageText);
	}

	const lines: string[] = [
		`# ${title}`,
		"",
		`> Source: ${url}`,
		`> Pages: ${pdf.numPages}${pdf.numPages > maxPages ? ` (extracted first ${maxPages})` : ""}`,
	];
	if (metaAuthor) lines.push(`> Author: ${metaAuthor}`);
	lines.push("", "---", "");
	lines.push(pages.join("\n\n"));

	if (pdf.numPages > maxPages) {
		lines.push(
			"",
			"---",
			"",
			`*[Truncated: Only first ${maxPages} of ${pdf.numPages} pages extracted]*`,
		);
	}

	return { url, title, content: lines.join("\n"), error: null };
}

// ── RSC Content Extraction (Next.js) ─────────────────────────────────

function extractRSCContent(
	html: string,
): { title: string; content: string } | null {
	if (!html.includes("self.__next_f.push")) return null;

	const chunkMap = new Map<string, string>();
	const scriptRegex =
		/<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

	for (const match of html.matchAll(scriptRegex)) {
		let content: string;
		try {
			content = JSON.parse('"' + match[1] + '"');
		} catch {
			continue;
		}
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			const colonIdx = line.indexOf(":");
			if (colonIdx <= 0 || colonIdx > 4) continue;
			const id = line.slice(0, colonIdx);
			if (!/^[0-9a-f]+$/i.test(id)) continue;
			const payload = line.slice(colonIdx + 1);
			if (!payload) continue;
			const existing = chunkMap.get(id);
			if (!existing || payload.length > existing.length) {
				chunkMap.set(id, payload);
			}
		}
	}

	if (chunkMap.size === 0) return null;

	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
	const title = titleMatch?.[1]?.split("|")[0]?.trim() || "";

	const parsedCache = new Map<string, unknown>();
	function getParsedChunk(id: string): unknown | null {
		if (parsedCache.has(id)) return parsedCache.get(id);
		const chunk = chunkMap.get(id);
		if (!chunk || !chunk.startsWith("[")) {
			parsedCache.set(id, null);
			return null;
		}
		try {
			const parsed = JSON.parse(chunk);
			parsedCache.set(id, parsed);
			return parsed;
		} catch {
			parsedCache.set(id, null);
			return null;
		}
	}

	type Node = unknown;
	const visitedRefs = new Set<string>();

	function extractNode(node: Node, ctx = { inCode: false }): string {
		if (node === null || node === undefined) return "";
		if (typeof node === "string") {
			const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
			if (refMatch) {
				const refId = refMatch[1];
				if (visitedRefs.has(refId)) return "";
				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				const result = refNode ? extractNode(refNode, ctx) : "";
				visitedRefs.delete(refId);
				return result;
			}
			if (
				!ctx.inCode &&
				(node === "$undefined" ||
					node === "$" ||
					/^\$[A-Z]/.test(node))
			)
				return "";
			return node.trim() ? node : "";
		}
		if (typeof node === "number") return String(node);
		if (typeof node === "boolean") return "";
		if (!Array.isArray(node)) return "";

		if (node[0] === "$" && typeof node[1] === "string") {
			const tag = node[1] as string;
			const props = (node[3] || {}) as Record<string, unknown>;
			const skipTags = [
				"script", "style", "svg", "path", "circle", "link", "meta",
				"template", "button", "input", "nav", "footer", "aside",
			];
			if (skipTags.includes(tag)) return "";

			if (tag.startsWith("$L")) {
				const refId = tag.slice(2);
				if (visitedRefs.has(refId)) return "";
				if (props.baseId && props.children)
					return `## ${String(props.children)}\n\n`;
				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				let result = "";
				if (refNode) result = extractNode(refNode, ctx);
				else if (props.children)
					result = extractNode(props.children as Node, ctx);
				visitedRefs.delete(refId);
				return result;
			}

			const children = props.children;
			const content = children
				? extractNode(children as Node, ctx)
				: "";

			switch (tag) {
				case "h1": return `# ${content.trim()}\n\n`;
				case "h2": return `## ${content.trim()}\n\n`;
				case "h3": return `### ${content.trim()}\n\n`;
				case "h4": return `#### ${content.trim()}\n\n`;
				case "h5": return `##### ${content.trim()}\n\n`;
				case "h6": return `###### ${content.trim()}\n\n`;
				case "p": return `${content.trim()}\n\n`;
				case "code": {
					const cc = children
						? extractNode(children as Node, { inCode: true })
						: "";
					return ctx.inCode ? cc : `\`${cc}\``;
				}
				case "pre": {
					const pc = children
						? extractNode(children as Node, { inCode: true })
						: "";
					return "```\n" + pc + "\n```\n\n";
				}
				case "strong": case "b": return `**${content}**`;
				case "em": case "i": return `*${content}*`;
				case "li": return `- ${content.trim()}\n`;
				case "ul": case "ol": return content + "\n";
				case "blockquote": return `> ${content.trim()}\n\n`;
				case "a": {
					const href = props.href as string | undefined;
					return href && !href.startsWith("#")
						? `[${content}](${href})`
						: content;
				}
				default: return content;
			}
		}

		return (node as Node[]).map((n) => extractNode(n, ctx)).join("");
	}

	const mainChunk = getParsedChunk("23");
	if (mainChunk) {
		const content = extractNode(mainChunk);
		if (content.trim().length > 100) {
			return {
				title,
				content: content.replace(/\n{3,}/g, "\n\n").trim(),
			};
		}
	}

	const contentParts: { order: number; text: string }[] = [];
	for (const [id] of chunkMap) {
		if (id === "23") continue;
		const parsed = getParsedChunk(id);
		if (!parsed) continue;
		visitedRefs.clear();
		const text = extractNode(parsed);
		if (
			text.trim().length > 50 &&
			!text.includes("page was not found") &&
			!text.includes("404")
		) {
			contentParts.push({
				order: parseInt(id, 16),
				text: text.trim(),
			});
		}
	}

	if (contentParts.length === 0) return null;
	contentParts.sort((a, b) => a.order - b.order);

	const seen = new Set<string>();
	const uniqueParts: string[] = [];
	for (const part of contentParts) {
		const key = part.text.slice(0, 150);
		if (!seen.has(key)) {
			seen.add(key);
			uniqueParts.push(part.text);
		}
	}

	const content = uniqueParts
		.join("\n\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return content.length > 100 ? { title, content } : null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function isLikelyJSRendered(html: string): boolean {
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	if (!bodyMatch) return false;
	const textContent = bodyMatch[1]
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const scriptCount = (html.match(/<script/gi) || []).length;
	return textContent.length < 500 && scriptCount > 3;
}

function extractHeadingTitle(text: string): string | null {
	const match = text.match(/^#{1,2}\s+(.+)/m);
	if (!match) return null;
	const cleaned = match[1].replace(/\*+/g, "").trim();
	return cleaned || null;
}

// ── Jina Reader Fallback ─────────────────────────────────────────────

async function extractWithJinaReader(
	url: string,
	signal?: AbortSignal,
): Promise<FetchResult | null> {
	try {
		const res = await fetch(JINA_READER_BASE + url, {
			headers: { Accept: "text/markdown", "X-No-Cache": "true" },
			signal: AbortSignal.any([
				AbortSignal.timeout(JINA_TIMEOUT_MS),
				...(signal ? [signal] : []),
			]),
		});
		if (!res.ok) return null;

		const content = await res.text();
		const contentStart = content.indexOf("Markdown Content:");
		if (contentStart < 0) return null;

		const markdownPart = content.slice(contentStart + 17).trim();
		if (
			markdownPart.length < 100 ||
			markdownPart.startsWith("Loading...") ||
			markdownPart.startsWith("Please enable JavaScript")
		) {
			return null;
		}

		const title =
			extractHeadingTitle(markdownPart) ??
			new URL(url).pathname.split("/").pop() ??
			url;
		return { url, title, content: markdownPart, error: null };
	} catch {
		return null;
	}
}

// ── Main HTTP Extraction ─────────────────────────────────────────────

async function extractViaHttp(
	url: string,
	signal?: AbortSignal,
): Promise<FetchResult> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort);

	let closeConnection: (() => Promise<void>) | undefined;
	try {
		const { response, finalUrl, close } = await fetchWithPolicy(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache",
				"Sec-Fetch-Dest": "document",
				"Sec-Fetch-Mode": "navigate",
				"Sec-Fetch-Site": "none",
				"Sec-Fetch-User": "?1",
				"Upgrade-Insecure-Requests": "1",
			},
		}, controller.signal);
		closeConnection = close;
		url = finalUrl.toString();

		if (!response.ok) {
			return {
				url, title: "", content: "",
				error: `HTTP ${response.status}: ${response.statusText}`,
			};
		}

		const contentType = response.headers.get("content-type") || "";
		const contentLengthHeader = response.headers.get("content-length");
		const isPDFContent = isPDF(url, contentType);
		const maxSize = isPDFContent ? MAX_PDF_SIZE : MAX_RESPONSE_SIZE;

		if (contentLengthHeader) {
			const contentLength = parseInt(contentLengthHeader, 10);
			if (contentLength > maxSize) {
				return {
					url, title: "", content: "",
					error: `Response too large (${Math.round(contentLength / 1024 / 1024)}MB)`,
				};
			}
		}

		if (isPDFContent) {
			const bytes = await readCappedBytes(response, maxSize, controller.signal);
			return await extractPDF(bytes.buffer as ArrayBuffer, url);
		}

		if (
			contentType.includes("application/octet-stream") ||
			contentType.includes("image/") ||
			contentType.includes("audio/") ||
			contentType.includes("video/") ||
			contentType.includes("application/zip")
		) {
			return {
				url, title: "", content: "",
				error: `Unsupported content type: ${contentType.split(";")[0]}`,
			};
		}

		const text = decodeBody(await readCappedBytes(response, maxSize, controller.signal), contentType)
			.slice(0, MAX_BODY_CHARS);
		const isHTML =
			contentType.includes("text/html") ||
			contentType.includes("application/xhtml+xml");

		if (!isHTML) {
			const title =
				extractHeadingTitle(text) ??
				new URL(url).pathname.split("/").pop() ??
				url;
			return { url, title, content: text, error: null };
		}

		const { document } = parseHTML(text);
		const reader = new Readability(document as unknown as Document);
		const article = reader.parse();

		if (!article) {
			const rscResult = extractRSCContent(text);
			if (rscResult) {
				return {
					url,
					title: rscResult.title,
					content: rscResult.content,
					error: null,
				};
			}

			const jsRendered = isLikelyJSRendered(text);
			return {
				url, title: "", content: "",
				error: jsRendered
					? "Page appears to be JavaScript-rendered (content loads dynamically)"
					: "Could not extract readable content from HTML structure",
			};
		}

		const markdown = turndown.turndown(article.content);

		if (markdown.length < MIN_USEFUL_CONTENT) {
			return {
				url,
				title: article.title || "",
				content: markdown,
				error: isLikelyJSRendered(text)
					? "Page appears to be JavaScript-rendered (content loads dynamically)"
					: "Extracted content appears incomplete",
			};
		}

		return {
			url,
			title: article.title || "",
			content: markdown,
			error: null,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { url, title: "", content: "", error: message, blocked: err instanceof FetchPolicyError };
	} finally {
		clearTimeout(timeoutId);
		signal?.removeEventListener("abort", onAbort);
		await closeConnection?.();
	}
}

// ── Public Fetch Function ────────────────────────────────────────────

async function fetchAndExtract(
	url: string,
	signal?: AbortSignal,
): Promise<FetchResult> {
	if (signal?.aborted) {
		return { url, title: "", content: "", error: "Aborted" };
	}

	try {
		new URL(url);
	} catch {
		return { url, title: "", content: "", error: "Invalid URL" };
	}

	const httpResult = await extractViaHttp(url, signal);
	if (signal?.aborted)
		return { url, title: "", content: "", error: "Aborted" };
	if (!httpResult.error) return httpResult;

	if (
		httpResult.blocked ||
		httpResult.error.startsWith("Unsupported content type") ||
		httpResult.error.startsWith("Response too large")
	) {
		return httpResult;
	}

	const jinaResult = await extractWithJinaReader(url, signal);
	if (jinaResult) return jinaResult;
	if (signal?.aborted)
		return { url, title: "", content: "", error: "Aborted" };

	return {
		...httpResult,
		error: `${httpResult.error}\n\nThe page may be JavaScript-rendered. Try:\n  • A different URL for the same content\n  • web_search to find cached/alternative versions`,
	};
}

// ── Extension Registration ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch a web page and extract readable content as clean markdown. Uses Readability + Turndown for high-quality HTML→markdown conversion. Handles PDFs and plain text, and falls back to Jina Reader for JS-rendered pages. Enforces the DeepSeek Harness network policy: public IP addresses only, same-origin redirects, charset/size limits.",
		promptSnippet:
			"Fetch a URL and extract readable content as markdown. Supports HTML pages, PDFs, and plain text.",

		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
		}),

		async execute(_toolCallId, params, signal) {
			const result = await fetchAndExtract(params.url, signal);

			if (result.error) {
				throw new Error(`${params.url}: ${result.error}`);
			}

			const header = result.title
				? `# ${result.title}\n\nSource: ${result.url}\n\n---\n\n`
				: "";
			return {
				content: [
					{
						type: "text" as const,
						text: header + result.content,
					},
				],
				details: {
					url: result.url,
					title: result.title,
					chars: result.content.length,
				},
			};
		},

		renderCall(args, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);
			const { url } = args as { url?: string };
			if (!url) {
				text.setText(
					theme.fg("toolTitle", theme.bold("fetch ")) +
						theme.fg("error", "(no URL)"),
				);
				return text;
			}
			const display =
				url.length > 70 ? url.slice(0, 67) + "..." : url;
			text.setText(
				theme.fg("toolTitle", theme.bold("fetch ")) +
					theme.fg("accent", display),
			);
			return text;
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);

			if (isPartial) {
				text.setText(theme.fg("warning", "Fetching…"));
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
				title?: string;
				chars?: number;
			};

			const title = details?.title || "Untitled";
			const chars = details?.chars ?? 0;
			const status =
				theme.fg("success", title) +
				theme.fg("muted", ` (${chars} chars)`);

			if (!expanded) {
				text.setText(status);
				return text;
			}

			const content =
				result.content.find((c) => c.type === "text")?.text || "";
			const preview =
				content.length > 500
					? content.slice(0, 500) + "..."
					: content;
			text.setText(status + "\n" + theme.fg("dim", preview));
			return text;
		},
	});
}
