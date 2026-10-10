# Brand

## Name and logo

- Name: **rebattle**, always lowercase.
- Logo: the whole sentence `drop. bounceback. rebattle.`. The name comes last; there is no separate tagline.
  - "drop." and "bounceback." in the muted colour, "rebattle." in full colour.
  - Full stops are **squares** (stem-width) in the logo only. Running text uses normal dots.
  - "bounceback" is one word in the logo only; in sentences it's "bounce back".
  - Amber underline under the whole word "rebattle". Where it animates (home screen, video intro) it waits while "drop. bounceback." is read (~1.1s), then draws left to right over ~0.75s.
- Short mark / icon: Funnel Display Bold "r" with the amber underline starting exactly at the letter's left ink edge. Rebuild with `tools/make-icons.py`.
- Competition screens: competition name on the left, logo on the right (the short mark on phones).

## Type

- **Funnel Display** for the logo, headings and big video titles; **Funnel Sans** for everything else. Bundled in `public/fonts/` (SIL OFL), latin + latin-ext.
- Tabular numbers wherever places or counts line up.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--accent` | `#ffb020` amber | the one accent: primary buttons, ready heats, focus, logo underline |
| `--win` | `#35c17a` green | advances, winner's path |
| `--losers` | `#a685ff` violet | Losers bracket, drops, runners-up |
| `--lose` | `#e35b5b` red | out (lost twice) only |
| `--bg` / `--panel` / `--panel-2` | `#111318` / `#181b22` / `#20232c` | neutral dark greys, slightly warm |

In the video, blue `#4f8cff` marks the Winners bracket (opposite violet for Losers).

## Wording

- "Winners bracket" / "Losers bracket"; short forms WB / LB.
- Final 4 origins: **WB 1st, WB 2nd, LB 1st, LB 2nd**.
- "Random draw" for Losers-bracket pairings; "Bye" for no opponent; "Out" for eliminated.
