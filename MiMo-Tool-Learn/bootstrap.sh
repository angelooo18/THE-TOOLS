#!/usr/bin/env bash
# bootstrap.sh — instala/repara la configuración pi-learn-setup. Idempotente.
# Uso: ./bootstrap.sh [--project-dir /ruta]   (default: ~/learning)
set -euo pipefail

PROJECT="${1:-$HOME/learning}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$HOME/.pi/agent"
EXT_GLOBAL="$AGENT_DIR/extensions"
GIT_PKG="$AGENT_DIR/git/github.com/amosblomqvist/pi-interactive-subagents"
SKILLS="$PROJECT/.pi"
SUBAGENTS_REPO="https://github.com/amosblomqvist/pi-interactive-subagents/archive/refs/heads/main.zip"

export PATH="$HOME/.local/bin:$PATH"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

say "Proyecto: $PROJECT"

# ── 1. Estructura del proyecto ────────────────────────────────────────────
mkdir -p "$PROJECT/.pi" "$PROJECT/lessons" "$PROJECT/viz"
cp -r "$REPO_DIR/project/.pi/skills" "$PROJECT/.pi/skills"
cp -r "$REPO_DIR/project/.pi/extensions" "$PROJECT/.pi/extensions"
cp -r "$REPO_DIR/project/.pi/agents" "$PROJECT/.pi/agents"
say "Config del proyecto copiada ($PROJECT/.pi)"

# ── 2. Extensiones globales ───────────────────────────────────────────────
mkdir -p "$EXT_GLOBAL"
cp -r "$REPO_DIR/global-extensions/web-search" "$EXT_GLOBAL/"
cp -r "$REPO_DIR/global-extensions/web-fetch" "$EXT_GLOBAL/"
cp "$REPO_DIR/global-extensions/custom-header.ts" "$EXT_GLOBAL/"
chmod +x "$EXT_GLOBAL/web-search/scripts/"*.py || true
say "Extensiones globales copiadas"

# ── 3. pi-interactive-subagents (sin necesidad de git) ────────────────────
mkdir -p "$GIT_PKG"
if [ ! -f "$GIT_PKG/package.json" ]; then
  tmp="$(mktemp -d)"
  curl -sL "$SUBAGENTS_REPO" -o "$tmp/sub.zip"
  unzip -qo "$tmp/sub.zip" -d "$tmp"
  cp -r "$tmp/pi-interactive-subagents-main/." "$GIT_PKG/"
  rm -rf "$tmp"
  say "pi-interactive-subagents descargado"
else
  say "pi-interactive-subagents ya presente"
fi

# Adaptar agentes bundled a DeepSeek + thinking max (reproducible)
for f in researcher scout worker; do
  sed -i 's|^model: .*$|model: deepseek/deepseek-flash|' "$GIT_PKG/agents/$f.md"
  sed -i 's|^thinking: .*$|thinking: max|' "$GIT_PKG/agents/$f.md"
done
say "Agentes bundled adaptados (DeepSeek, thinking max)"

# ── 4. settings.json: registrar el paquete git ────────────────────────────
python3 - "$AGENT_DIR/settings.json" <<'EOF'
import json, sys
p = sys.argv[1]
d = {}
try:
    d = json.load(open(p))
except Exception:
    pass
pkgs = d.setdefault("packages", [])
pk = "git:github.com/amosblomqvist/pi-interactive-subagents"
if pk not in pkgs:
    pkgs.append(pk)
json.dump(d, open(p, "w"), indent=2)
EOF
say "settings.json actualizado"

# ── 5. Python deps (pip user, sin sudo) ───────────────────────────────────
python3 -m pip --version >/dev/null 2>&1 || {
  say "Instalando pip (bootstrap)"
  curl -s https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  python3 /tmp/get-pip.py --user --break-system-packages -q
}
python3 -m pip install --user --break-system-packages -q pymupdf ddgs cairosvg
say "pip: pymupdf, ddgs, cairosvg listos"

# ── 6. Dependencias npm ───────────────────────────────────────────────────
cd "$PROJECT/.pi/extensions/visual-tools"
if [ ! -d node_modules ]; then
  PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-audit --no-fund
fi
say "npm visual-tools listo"
cd "$EXT_GLOBAL/web-fetch"
[ -d node_modules ] || npm install --no-audit --no-fund
say "npm web-fetch listo"

# ── 7. Lanzadores (learn, learn-studio) ───────────────────────────────────
mkdir -p "$HOME/.local/bin"
sed 's|{HOME}|'"$HOME"'|g' "$REPO_DIR/launchers/learn" > "$HOME/.local/bin/learn"
sed 's|{HOME}|'"$HOME"'|g' "$REPO_DIR/launchers/learn-studio" > "$HOME/.local/bin/learn-studio"
chmod +x "$HOME/.local/bin/learn" "$HOME/.local/bin/learn-studio"
mkdir -p "$HOME/.local/share/applications"
sed 's|{HOME}|'"$HOME"'|g' "$REPO_DIR/launchers/learn.desktop" > "$HOME/.local/share/applications/learn.desktop"
sed 's|{HOME}|'"$HOME"'|g' "$REPO_DIR/launchers/learn-studio.desktop" > "$HOME/.local/share/applications/learn-studio.desktop"
sed 's|{HOME}|'"$HOME"'|g' "$REPO_DIR/launchers/obsidian.desktop" > "$HOME/.local/share/applications/obsidian.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
say "Lanzadores instalados"

# ── 7b. Refuerzo de formato LaTeX (apéndido por learn) ─────────────────────
mkdir -p "$HOME/.pi/agent"
cp "$REPO_DIR/docs/learn-format.md" "$HOME/.pi/agent/learn-format.md"
say "Refuerzo de LaTeX instalado (~/.pi/agent/learn-format.md)"

# ── 8. AGENTS.md desde plantilla ──────────────────────────────────────────
if [ -f "$REPO_DIR/docs/AGENTS.example.md" ]; then
  sed 's|{HOME}|'"$HOME"'|g; s|{PEOPLE_DIR}|'"$HOME"'/Documents|g' \
    "$REPO_DIR/docs/AGENTS.example.md" > "$PROJECT/AGENTS.md"
  say "AGENTS.md generado (edítalo: nombres de carpetas de tus referencias)"
fi

# ── 9. Trust del proyecto ─────────────────────────────────────────────────
python3 - "$AGENT_DIR/trust.json" "$PROJECT" <<'EOF'
import json, sys, os
p, proj = sys.argv[1], sys.argv[2]
d = {}
try:
    d = json.load(open(p))
except Exception:
    pass
d[os.path.realpath(proj)] = True
json.dump(d, open(p, "w"), indent=2)
EOF
say "Trust del proyecto registrado"

say "¡Listo! Pendientes manuales:"
echo "  1. tmux (subagentes): ln -s /ruta/tmux.AppImage \$HOME/.local/bin/tmux"
echo "  2. Obsidian: 1ª vez, Open folder as vault -> \$PROJECT"
echo "  3. Abre con: learn-studio"
