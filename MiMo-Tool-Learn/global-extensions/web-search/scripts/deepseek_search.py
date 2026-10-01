#!/usr/bin/env python3
"""
Búsqueda web nativa de DeepSeek (API compatible con Anthropic, server tool
web_search_20250305), replicando el proveedor dsh-web-search-deepseek del
deepseek-harness oficial v0.1.6-alpha.1. Sin API key adicional: usa la de pi.

Overrides por entorno: DEEPSEEK_SEARCH_BASE_URL, DEEPSEEK_SEARCH_MODEL.

Uso: deepseek_search.py "query" [count] [--key PATH_OR_ENV]
Imprime JSON: [{"title":..., "url":..., "snippet":..., "publishedAt"?:...}, ...]
Última línea de stderr en caso de error (exit != 0).
"""
import json
import os
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = os.environ.get("DEEPSEEK_SEARCH_BASE_URL") or "https://api.deepseek.com/anthropic/v1"
DEFAULT_MODEL = os.environ.get("DEEPSEEK_SEARCH_MODEL") or "deepseek-flash"
API_VERSION = "2023-06-01"
MAX_TOKENS = 4096
MAX_USES = 5
USER_AGENT = "deepseek-harness/0.0.1"


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """El proveedor oficial no sigue redirecciones (fetch redirect: 'error')."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code,
            f"redirect to {newurl} is not followed; retry against that URL directly",
            headers, fp,
        )


def load_api_key() -> str:
    env = os.environ.get("DEEPSEEK_API_KEY")
    if env:
        return env
    auth_path = os.path.expanduser(
        os.environ.get("PI_AUTH_JSON", "~/.pi/agent/auth.json")
    )
    try:
        with open(auth_path) as f:
            data = json.load(f)
        key = data.get("deepseek", {}).get("key")
        if key:
            return key
    except Exception:
        pass
    return ""


def main() -> int:
    if len(sys.argv) < 2:
        print("falta query", file=sys.stderr)
        return 2
    query = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    api_key = load_api_key()
    if not api_key:
        print("sin clave DeepSeek: configura DEEPSEEK_API_KEY o ~/.pi/agent/auth.json",
              file=sys.stderr)
        return 2

    body = {
        "model": DEFAULT_MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Perform a web search for the query: {query}"}
                ],
            }
        ],
        "tools": [
            {"type": "web_search_20250305", "name": "web_search", "max_uses": MAX_USES}
        ],
    }
    req = urllib.request.Request(
        f"{DEFAULT_BASE}/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": api_key,
            "authorization": f"Bearer {api_key}",
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent": USER_AGENT,
        },
    )
    try:
        opener = urllib.request.build_opener(_NoRedirectHandler)
        with opener.open(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            err_payload = json.loads(e.read().decode("utf-8", "replace"))
            err = err_payload.get("error")
            if isinstance(err, dict):
                detail = err.get("message") or ""
            elif isinstance(err, str):
                detail = err
            if not detail:
                detail = err_payload.get("message") or ""
        except Exception:
            pass
        suffix = f": {detail}" if detail else ""
        print(f"DeepSeek API error (HTTP {e.code}){suffix}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"deepseek search request failed: {e}", file=sys.stderr)
        return 1

    blocks = payload.get("content", [])
    result_blocks = [b for b in blocks if b.get("type") == "web_search_tool_result"]
    if not result_blocks:
        print("DeepSeek no devolvió web_search_tool_result (búsqueda nativa no disponible)",
              file=sys.stderr)
        return 1

    # snippets: citations de bloques text (url -> cited_text, primera ocurrencia)
    snippets = {}
    for b in blocks:
        if b.get("type") != "text":
            continue
        for cite in b.get("citations", []) or []:
            url = cite.get("url")
            text = cite.get("cited_text")
            if url and text and url not in snippets:
                snippets[url] = text

    seen = set()
    out = []
    for b in result_blocks:
        for item in b.get("content", []):
            if item.get("type") != "web_search_result":
                continue
            url = item.get("url") or ""
            if not url or url in seen:
                continue
            seen.add(url)
            entry = {
                "title": item.get("title") or "",
                "url": url,
                "snippet": (snippets.get(url) or "").replace("\n", " "),
            }
            page_age = item.get("page_age")
            if page_age:
                entry["publishedAt"] = page_age
            out.append(entry)

    print(json.dumps(out[:count]))
    if not out:
        print("DeepSeek devolvió 0 resultados", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
