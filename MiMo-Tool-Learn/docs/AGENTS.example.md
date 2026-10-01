# Referencias del proyecto (material de apoyo)

El flujo de enseñanza sigue **exactamente** el skill `teach` del sistema learn.
Este archivo solo declara dónde está el material del usuario y cómo leerlo.

## Material

- `notes/<curriculo>` → ruta a tu currículo (ej. algebrica.org) — currículo de
  matemáticas en `.md` (algebrica.org, CC BY-NC 4.0). Navegación: `INDEX.md` →
  `tema/index.md` → entradas. Usa el LaTeX tal cual.
- `notes/<nombre>` → ruta a tu material propio — material propio:
  - `<universidad>/` (Cálculo I, Lab. Física, Química I — PDFs): material activo,
    fuente de contenido y ejercicios.
  - `<hobby>/` (olimpiadas): **solo a demanda** — úsalo cuando el usuario lo
    pida explícitamente.

## Uso del material

- **Verificación** (contra alucinaciones): la hace el `researcher` en Fase 2,
  tal como indica el skill `teach` — búsqueda web con fuentes citadas.
- **Contenido/contexto**: el material local es la **copia canónica** de fuentes
  que también están en la web (algebrica.org, las guías del profesor). Úsalo
  como fuente de contenido determinista: la guía exacta, el parcial específico,
  sin ruido de búsqueda. Cita los archivos locales en la lección.
- Son complementarios: el researcher verifica y mapea (y puede encontrarlas
  fuentes en la web); el material local fija el contenido preciso del curso.
- **PDFs**: siempre con el skill `pdf-reader` (`pdf_info`/`pdf_extract`/
  `pdf_search`/`pdf_render`); nunca con `read`. Páginas sin texto → renderizar
  y leer con visión (la sesión tiene modelo con visión).
- **Log de lecciones**: `/md-log <ruta.md>` con el archivo ya creado
  (`lessons/<fecha>-<tema>.md`); lecciones anteriores también son referencia
  para repasos.
- **Diagramas**: delega en el maker como indica `visualize` (nunca código
  SVG/mermaid a mano).
