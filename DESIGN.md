# Design

## Visual theme

Night, glass and light. A near-black teal ground lit from below by orange, like a street lamp on wet tarmac.
One glass asterisk turns in the middle of the first screen; a single soft ribbon of light drifts behind the rest of the page.
Fine film grain over everything. Lots of empty space. Inspired by monopo.london's restraint and the owner's
"Direction 02 Signal" exploration in Claude Design.

## Colour

| Token | Value | Role |
|---|---|---|
| `--pearl` | `#04141E` | Page ground (black pearl) |
| `--pearl-2` | `#08212D` | Image placeholders |
| `--teal` | `#64DBE8` | Ambient light, focus rings, text selection |
| `--orange` | `#FF6D04` | Asterisks and the glow under the mark only |
| `--ink` | `#E6F0F1` | Text |
| `--mute` | `rgb(230 240 241 / .7)` | Secondary text |
| `--line` | `rgb(230 240 241 / .16)` | Hairlines and button borders |

Strategy: restrained. Teal and orange never mix in one area (they cancel to grey); in the shader each gives way to the other.
The lime/plum palette from the 2025 brand system is retired on the site.

## Typography

- **Inter** (variable, optical sizes 14–32, weights 300–500) for everything. Display sizes use 300, tracking −0.03 to −0.04em.
- **Cascadia Mono** only for the small gallery labels and index numbers (uppercase, +0.14em).
- Scale: hero line `clamp(1.5rem, 2.5vw, 2.25rem)`; statement `clamp(1.75rem, 3.8vw, 3.5rem)`; contact `clamp(3rem, 9vw, 6rem)`.

## Layout

Four sections: hero (full viewport, text bottom-left), statement (10 of 12 columns, note offset right),
Selected work (pinned full-viewport stage), contact (one big link) and a hairline footer.
Gutter `clamp(16px, 3.2vw, 44px)`. Fixed header: wordmark left, three text links right, soft top scrim.

## Components

- **Glass mark**: four capsules at 45° in three.js `MeshPhysicalMaterial` (transmission, dispersion), spins slowly,
  tilts toward the pointer, rises and shrinks as the hero scrolls away.
- **Gallery card**: 3:4 photo, 3px radius, mono index above. In the row it is scaled down from its detail size, so it stays sharp when opened.
- **Detail panel**: index, title (light, large), meta, one sentence, pill buttons (Prev, Next, Close; Close is filled).

## Motion

Exponential ease-outs (`cubic-bezier(.16,1,.3,1)`, GSAP `expo.out`, `power4.inOut` for the card flight). Lines reveal through masks once.
Page scroll pans the gallery; drag and sideways swipes pan it too and settle on the nearest card.
Reduced motion: still scene, no float or tilt, instant open/close.
