# Formato de las lecciones (refuerzo por turno)

- **Matemática SIEMPRE en LaTeX**, como indica el skill `teach`:
  - Inline: `$f(x)$`, `$\frac{1}{x}$`, `$\lim_{x\to0}$`
  - Display centrado: `$$` fenced en sus propias líneas:
    ```
    $$\frac{d}{dx}\left(\frac{1}{x}\right) = -\frac{1}{x^2}$$
    ```
- **NUNCA** notación lineal ni unicode para fórmulas: `1/x`, `x^-1`, `x⁻¹`,
  `x²`, `lim x->0` — Obsidian solo renderiza LaTeX. Si lo escribes así, el
  usuario ve texto plano ilegible.
- Los diagramas de dependencias: bloque `mermaid` en el log (Obsidian lo
  renderiza).
