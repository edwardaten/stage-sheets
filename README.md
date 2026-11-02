# Stage Sheets

An offline iPad app that turns chord sheets pasted from Ultimate Guitar into clean, one-page lead sheet PDFs for forScore.

- **Use it:** open the GitHub Pages site on your iPad in Safari, then Share > Add to Home Screen. It works offline after that, and your library stays on the iPad.
- **Design rules:** see [DESIGN.md](DESIGN.md).

## Layout

- `src/engine.js`: parsing, key detection, transposing, page layout, SVG and PDF rendering.
- `src/app.js`: library, editor, preview, import and export.
- `src/shell.html`: page markup and styles.
- `src/examples.js`: example songs with placeholder lyrics.
- `assets/`: fonts (IBM Plex, SIL Open Font License) and vendored libraries (jsPDF, JSZip, MIT).
- `docs/`: the built site that GitHub Pages serves. Do not edit by hand.
- `tools/size_test.py`: text size test sheet.

## Build

```
python3 build.py
```

This writes `docs/` (the site) and `dist/artifact/` (a single-file preview). Bump `VERSION` in `build.py` when you ship, so installed copies pick up the update.
