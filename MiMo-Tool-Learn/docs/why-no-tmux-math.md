# Por qué el math de pi-math no puede funcionar dentro de tmux

Conclusión: **no es una limitación evitable por configuración** — es transporte.
Verificado con tmux 3.5a + kitty 0.32, byte a byte (14/15 sep 2025).

## Evidencia

1. **Detección de pi** (`dist/bundle/chunks/`): con `$TMUX` o `TERM=tmux*`,
   la autodetección devuelve `{images: null}` — desactiva imágenes.
   Se puede forzar con `PI_IMAGE_PROTOCOL=kitty` (el override se aplica antes).

2. **Pero tmux filtra las secuencias igual.** Prueba de transporte (pty
   capturado con `script`, secuencia kitty de 1×1 px emitida desde un pane):

   | emisión | `allow-passthrough on` | `off` |
   |---|---|---|
   | APC crudo (`\x1b_G…\x1b\\`) | **descartado** | descartado |
   | envuelto en `\x1bPtmux;…\x1b\\` | **pasa** (tmux lo desenvuelve) | descartado |

   `allow-passthrough` solo habilita el wrapper `\ePtmux;` (man tmux 3.5a),
   no el forwarding genérico de secuencias.

3. **Ni pi ni pi-math emiten el wrapper** (0 ocurrencias en ambos;
   pi-math genera APC crudo en `src/kitty-graphics.ts`).

4. **Parchear pi-math no alcanza**: pi (el TUI) emite sus propias secuencias
   de borrado/evicción de imágenes que también serían descartadas → imágenes
   fantasma tras redraws/resizes; y la grilla de tmux no sigue la geometría
   de las imágenes (copy-mode/scrollback las desincroniza).

## Decisión final (15 sep 2025)

Se mantiene el flujo de siempre: **tmux + Obsidian** (`learn`, `learn-studio`).
pi-math queda desinstalado; si algún día se reinstala
(`pi install npm:@monotykamary/pi-math`), solo renderiza fuera de tmux y no
aporta nada al flujo actual.
