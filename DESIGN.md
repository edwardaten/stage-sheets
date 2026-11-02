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

**Header**
- Big title and artist.
- KEY shows the key the song sounds in. With a capo, an amber box shows CAPO n and the chord shapes played (PLAY G shapes). Without a capo it says NO CAPO.
- BPM and tuning when set (tuning only when not standard).
- Chords summary box, top right. Sections that share a progression merge into one row. When one loop covers the whole song it says WHOLE SONG.
- MY CHANGES box for arrangement notes.
- Chord diagrams only for chords the user marks (`Shape: Cadd9 x32033`, or the shapes field).
- No strumming patterns. No time signature.

**Body**
- Monospaced font wherever chords sit over lyrics, so UG spacing pastes straight in.
- Each section type has its own color. Chorus is the one that pops.
- A line starting with `!` becomes a red banner (key changes, big reminders).
- Repeated chord-only lines condense to `Am F C G ×4`.
- A section that runs on one short loop puts the loop on its label and prints lyrics only.
- A line that starts with a single chord shows the chord in a left gutter beside the lyric.

**Files and metadata**
- File name: `Artist - Title.pdf`.
- PDF metadata that forScore reads on import: Title, Author (artist, shown as composer), Keywords (tags plus `keysf:`/`keymi:` for key).
- Tags: Campfire, Bar, Jam, Blues, plus free tags. Used for forScore setlists and finding songs to play with others.
- Light and dark paper toggle.

## Agreed next (v3 layout)

1. **Repeats become a roadmap.** A section prints in full the first time. Later identical repeats become a compact flow line of colored chips, like `PRE-CHORUS → CHORUS → SOLO ×4`. When a repeat has new words and the song still fits on one page, show only the changed lines.
2. **Sections as full tinted bands, not header rows.** The label moves to a small margin tag, so it costs no row. Verses stay plain. Should look designed, not highlighted.
3. **Lyric-only sections in a narrow sans font.** No alignment is needed there, and it fits about 50% more words per line.
4. **Two columns as a fallback** to hold one page, breaking only between sections.
5. **Fitting order:** condense loops, roadmap repeats, compact sections, shrink text to the floor, two columns, then two pages.
6. Text size floor: 11 pt (chosen from the size test sheet, `tools/size_test.py`).

## Parked

- Start cue and ending cue fields (from a friend's sheets: "C > D start", "E minor ending"). Not now.
- Bulk export from Ultimate Guitar via a Mac script.

## Reference

- forScore PDF metadata: https://forscore.co/developers-pdf-metadata/
- Test songs in `src/examples.js` use original placeholder lyrics. Never commit real song lyrics to this repo.
