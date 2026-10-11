# Brand

## Name and logo

- Name: **rebattle**, always lowercase.
- Logo: the whole sentence `drop. bounceback. rebattle.`. The name comes last; there is no separate tagline.
  - "drop." and "bounceback." in the muted colour, "rebattle." in full colour.
  - Full stops are **squares** (stem-width) in the logo only. Running text uses normal dots.
  - "bounceback" is one word in the logo only; in sentences it's "bounce back".
  - Amber underline under the whole word "rebattle". Where it animates (home screen, video intro) it waits while "drop. bounceback." is read (~1.1s), then draws left to right over ~0.75s.
- Short mark / icon: Funnel Display Bold "r" with the amber underline starting exactly at the letter's left ink edge. Rebuild with `tools/make-icons.py`.
- Logo as an image (README): `docs/logo-dark.svg` / `docs/logo-light.svg`, the same sentence drawn as outlines from the bundled font. Rebuild with `tools/make-logo.py`.
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

**Day colours** (light theme, `@media (prefers-color-scheme: light)` in `public/styles.css`): warm off-white page `#f6f5f2`, white cards, borders `#dcd9d1`, text `#15171c`, muted `#5f636d`. Amber stays `#ffb020` where it is a fill (buttons, the logo underline, ready heats); as text or a thin line it is `#8f5c00` / `#8a5a00`. Green `#17713f`, violet `#6a45d1`, red `#c23737`. Every text colour is at least 4.5:1 on white cards (WCAG AA). Finished heats fade less than in the dark theme (`--fade-*`), so their text stays readable. The replay video stays dark in both themes: it is a file people post, so it looks the same whatever device made it.

In the video, blue `#4f8cff` marks the Winners bracket (opposite violet for Losers); the app uses it (`--winners`) only for the intro's Winners bracket step.

## Wording

- "Winners bracket" / "Losers bracket"; short forms WB / LB.
- Final 4 origins: **WB 1st, WB 2nd, LB 1st, LB 2nd**.
- "Random draw" for Losers-bracket pairings; "Bye" for no opponent; "Out" for eliminated.
