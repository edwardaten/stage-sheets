# Stage Sheets design rules

Stage Sheets turns chord sheets pasted from Ultimate Guitar into lead sheets for forScore on an iPad Pro, read in portrait from a music stand while playing guitar and singing. The goal is quality lead sheets that are instantly readable and beautiful, not a reformatted copy of the UG paste.

Read this file before changing the app. Update it when a decision changes.

## How it fits together

- The app is the workshop: it keeps the song library (pasted text plus key, capo, notes, tags) on the iPad and exports PDFs. It works offline once installed from GitHub Pages.
- forScore is the stage: setlists, page turns, annotations.
- Re-exporting is cheap. Design changes apply to every song at once.

## Decided

**Page**
- Page size 540 x 720 pt, the iPad Pro portrait screen shape, so forScore shows it with no letterboxing.
- Nearly every song fits on one page. Long or complicated songs may use two. Never three.
- Pages never break inside a section. A section taller than a whole page is the only exception.
- When a song runs to two pages, page 2 repeats a slim header and the page 1 footer names the next section.

**Header (v4): read once, so it stays small**
- One title line: title (20 pt, shrinks to fit), artist and BPM small beside it. Key and capo pills at the right. The capo stays amber.
- Full-width chords strip under it: section labels in their colors, then the chords large in bold monospace. Sections that share a progression merge. When one loop covers the whole song it says WHOLE SONG. This is the most important part of the header.
- Chord diagrams sit at the right end of the strip, only for chords the user marks (`Shape: Cadd9 x32033`, or the shapes field).
- My changes: up to three small lines with a thin amber rule.
- Tuning shows only when not standard. No strumming patterns. No time signature.

**Body (v4)**
- No section labels. Sections are told apart by color only: chorus, pre-chorus, refrain, bridge and instrumental blocks get a soft tint in their color. Verses are untinted with a thin line down the left in the verse color. The chords strip in the header doubles as the color key.
- The main loop is the progression shared by the most sections. Sections on it print lyrics only, in the narrow sans font.
- A section on its own short loop prints lyrics only, with that loop as a big bold chord line at the top of its block.
- Intros, solos, instrumentals and outros print as big bold chord lines (`Am  F  C  G  ×4`).
- Other sections print chords over lyrics in monospace. A line that starts with a single chord shows the chord in a left gutter.
- Repeats: an exact repeat becomes a labeled chip in a roadmap line (`PRE-CHORUS → CHORUS → SOLO ×4`). The roadmap is the only place labels remain. A repeat with new words shows only the changed lines. A single changed short line sits inline after its chip. A repeat that ends by repeating its last line becomes `CHORUS  last line ×2`. Chord-only lines (like a turnaround) are ignored when comparing repeats. On two-page songs, repeats with new words print in full.
- A line starting with `!` becomes a red banner.
- UG carry-over chords in parentheses, like `(G)`, print where pasted but are left out of the chords strip.

**Chords on the sheet (per song)**
- Summary (default): the main loop goes in the chords strip and sections on it print as clean lyrics. Best for songs that just cycle a loop.
- Inline: every chord prints over its word, as pasted. For songs where chord changes land on specific words (example: Angel). Inline keeps the compact header, chords strip, tints, big chord lines for intros and solos, the single-chord gutter, and roadmap chips for exact repeats.
- Landscape was considered and rejected: same page area as portrait, and two landscape columns hold only about 48 characters at 11 pt, so long chord lines would break.

**Fitting**
- Order: one column at the largest size from 16 down to 10 pt. Then two columns. Two columns win only when they allow text at least 2 pt larger, or when one column can't fit. Two columns are never used if a chords-over-lyrics line would have to break.
- If one page is impossible, use two pages at the largest size where at most one chords-over-lyrics line breaks.
- Text floor is 10 pt (lowered from 11 at the user's request after testing).
- In one column, the fitter will drop up to 1.5 pt below the largest one-page size if that keeps every chords-over-lyrics line whole.
- Blocks never split across columns or pages unless one is taller than a whole column.

**Files and metadata**
- File name: `Artist - Title.pdf`.
- PDF metadata that forScore reads on import: Title, Author (artist, shown as composer), Keywords (tags plus `keysf:`/`keymi:` for key).
- Tags: Campfire, Bar, Jam, Blues, plus free tags. Used for forScore setlists and finding songs to play with others.
- Light and dark paper toggle.

## Parked

- Start cue and ending cue fields (from a friend's sheets: "C > D start", "E minor ending"). Not now.
- Bulk export from Ultimate Guitar via a Mac script.

## Reference

- forScore PDF metadata: https://forscore.co/developers-pdf-metadata/
- Test songs in `src/examples.js` use original placeholder lyrics. Never commit real song lyrics to this repo.
