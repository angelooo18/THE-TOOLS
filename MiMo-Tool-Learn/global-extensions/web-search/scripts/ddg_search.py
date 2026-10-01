#!/usr/bin/env python3
"""
Búsqueda web local vía DuckDuckGo (sin API key, sin coste).
Uso: ddg_search.py "query" [count]
Imprime JSON: [{"title": ..., "url": ..., "snippet": ...}, ...]
"""
import json
import sys

def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "falta query"}), file=sys.stderr)
        return 2
    query = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            print(
                json.dumps({
                    "error": "ddgs no está instalado. Ejecuta: "
                             "python3 -m pip install --user --break-system-packages ddgs"
                }),
                file=sys.stderr,
            )
            return 2

    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=count))
    except Exception as e:  # p. ej. rate-limit de DuckDuckGo
        print(json.dumps({"error": f"DuckDuckGo falló: {e}"}), file=sys.stderr)
        return 1

    out = [
        {
            "title": r.get("title", ""),
            "url": r.get("href") or r.get("url", ""),
            "snippet": r.get("body", ""),
        }
        for r in results
    ]
    print(json.dumps(out))
    return 0

if __name__ == "__main__":
    sys.exit(main())
