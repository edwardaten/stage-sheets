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
- Chords summary box, top right: section labels on the left, chords on the right. Sections that share a progression merge into one row. When one loop covers the whole song it says WHOLE SONG.
- MY CHANGES box for arrangement notes.
- Chord diagrams only for chords the user marks (`Shape: Cadd9 x32033`, or the shapes field).
- No strumming patterns. No time signature.

**Body (v3)**
- Every section is a block with its label in a small left tag column, so labels cost no row. Chorus, pre-chorus, refrain, bridge and instrumental blocks get a soft tint in their section color. Verses stay plain with a faint rule. Labels are shortened: PRE, POST, INST.
- The main loop is the progression shared by the most sections. It shows once in the chords box. Sections on it print lyrics only, in the narrow sans font.
- A section on its own short loop prints lyrics only and shows that loop under its tag.
- Other sections print chords over lyrics in monospace. A line that starts with a single chord shows the chord in a left gutter.
- Chord-only lines condense to `Am F C G ×4`.
- Repeats: an exact repeat becomes a chip in a roadmap line (`PRE-CHORUS → CHORUS → SOLO ×4`). A repeat with new words shows only the changed lines (tagged "new lines"). A single changed short line sits inline after its chip. On two-page songs, repeats with new words print in full.
- A later section with the same chords as an earlier one of the same name prints lyrics only ("same chords"), on one-page songs only.
- A line starting with `!` becomes a red banner.

**Fitting**
- Order: one column at the largest size from 15 down to 11 pt. Then two columns. Two columns win only when they allow text at least 2 pt larger, or when one column can't fit.
- If one page is impossible, use two pages at the largest size that fits.
- Text floor is 11 pt everywhere (chosen from `tools/size_test.py`).
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
