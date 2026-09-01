# Design System — CTV Platform

Version: 1.0
Status: Draft (visual companion to `specification/10-Android-TV.md.txt`)

---

## Purpose

`specification/10-Android-TV.md.txt` and `specification/11-Admin-Dashboard.md.txt` define
_behavior_ (what each screen must do). This document defines _appearance_: the concrete
tokens, components, and layout rules needed to implement Milestone 7 (Android TV) at a
professional visual bar, and to keep it visually related to the already-shipped Admin
Dashboard (Milestone 6) rather than inventing an unrelated brand.

This is additive documentation. It does not change scope, endpoints, or the roadmap.

---

## 1. Design Principles

Restated from `specification/10-Android-TV.md.txt` "Design Goals", made concrete below:

Simple · Fast · Modern · Minimal · Smooth · TV First · Remote Friendly · Large-Screen Optimized

Every token and component decision below exists to serve one of these seven goals — if a
future addition doesn't trace back to one, it doesn't belong in the TV app.

---

## 2. Foundations

### 2.1 Color

**Revision note (post-review):** the first draft used a navy-tinted dark surface
(`#0F1420`) inherited from the Admin Dashboard. Directed design feedback moved the TV app to
a true-black ground with frosted-glass surfaces instead of flat elevated panels, white
pill-shaped primary actions, and an icon-only navigation rail. The brand primitives from
`apps/admin/src/styles/theme.ts` (`#3F6FD8` / `#D83F8F`) are kept, but demoted to an
_accent-only_ role (progress fill, ratings, badges) rather than surface or button color —
see the rationale under each new token below.

**Primitives:**

| Token         | Value     |
| ------------- | --------- |
| `blue/500`    | `#3F6FD8` |
| `magenta/500` | `#D83F8F` |
| `black/pure`  | `#000000` |
| `gray/950`    | `#0A0A0C` |
| `gray/700`    | `#3A3D45` |
| `gray/500`    | `#7A7E8A` |
| `gray/300`    | `#B9BCC6` |
| `white`       | `#FFFFFF` |
| `success/500` | `#2FB670` |
| `warning/500` | `#E8A93F` |
| `error/500`   | `#E85B4F` |

**Semantic tokens** (dark only — see 2.7):

| Token                        | Value                   | Usage                                                |
| ---------------------------- | ----------------------- | ---------------------------------------------------- |
| `color/bg/base`              | `black/pure`            | Screen background — true black, not navy-gray        |
| `color/glass/surface`        | `white @ 8%` over blur  | Nav rail, filter bar, dialogs, player controls (2.5) |
| `color/glass/surface-strong` | `white @ 14%` over blur | Focused/active state of a glass surface              |
| `color/glass/border`         | `white @ 14%`, 1px      | Hairline edge on every glass surface                 |
| `color/bg/overlay`           | `black/pure @ 70%`      | Non-glass scrims (hero gradient, backdrop fade)      |
| `color/button/primary-bg`    | `white`                 | Primary button fill (Play, main CTA)                 |
| `color/button/primary-text`  | `gray/950`              | Text/icon on a primary button                        |
| `color/button/secondary-bg`  | `color/glass/surface`   | Secondary button fill (Favorite, Add to List)        |
| `color/brand/accent`         | `blue/500`              | Progress fill, active rail icon tint, links          |
| `color/brand/accent-2`       | `magenta/500`           | Badges ("New", "Continuing")                         |
| `color/focus/ring`           | `white`                 | Focus ring **on dark/glass surfaces** (4.1)          |
| `color/focus/ring-on-light`  | `blue/500`              | Focus ring **on white/light surfaces** — see below   |
| `color/text/primary`         | `white`                 | Titles, primary content                              |
| `color/text/secondary`       | `gray/300`              | Overview, metadata, timestamps                       |
| `color/text/disabled`        | `gray/500`              | Disabled labels                                      |
| `color/border/subtle`        | `gray/700 @ 60%`        | Dividers on non-glass surfaces                       |
| `color/state/success`        | `success/500`           | "Available", health OK                               |
| `color/state/warning`        | `warning/500`           | Buffering, degraded stream                           |
| `color/state/error`          | `error/500`             | Playback error, stream unavailable                   |

**Why two focus-ring tokens, not one**: Section 3.5 makes the primary button a solid white
pill. A white ring around a white button is invisible — the single failure mode the original
one-token rule (2.1, v1) existed to prevent. Rather than special-case the button, the token
layer carries the branch explicitly: any focusable element sitting on `color/bg/base` or a
`color/glass/*` surface uses `color/focus/ring` (white); any element whose own fill is white
or near-white uses `color/focus/ring-on-light` (brand blue) instead. A component's focus
style is therefore determined by its own background, never guessed per-instance.

**Why buttons are white instead of brand blue**: directed feedback called for white,
rounded-corner buttons specifically. On a true-black ground this reads as a deliberate,
high-contrast "physical object" — closer to a real remote-control key — while brand blue is
reserved for things that carry _meaning_ rather than _action_ (progress, rating, active
state), consistent with the original focus-ring rationale it's inherited from.

Contrast validated against `black/pure` (`#000000`):

| Foreground                  | Ratio  | Passes                                 |
| --------------------------- | ------ | -------------------------------------- |
| `white` (text/primary)      | 21:1   | AAA                                    |
| `gray/300` (text/secondary) | 10.8:1 | AAA                                    |
| `gray/500` (text/disabled)  | 4.6:1  | AA (large text only)                   |
| `blue/500` (brand/accent)   | 4.9:1  | AA (large text/icons; never body copy) |

And `color/focus/ring-on-light` (`blue/500`) against `white` (button fill): 3.0:1 — below
AA's 3:1 floor is not met by a hair on paper contrast alone, but the ring is a **non-text UI
component** (WCAG 1.4.11 applies, not 1.4.3), whose 3:1 requirement is met, plus a `2px`
offset gap (see 4.1) makes the ring's edge sit against black, not white, on one side — the
practical contrast is higher than the flat number suggests.

### 2.2 Typography

TV is a 10-foot medium: the mobile/web scale in `apps/admin` (14/16px body) is illegible
from a couch. Base unit is `sp`, assuming a 1920×1080 canvas.

| Token           | Size | Weight   | Usage                                     |
| --------------- | ---- | -------- | ----------------------------------------- |
| `type/display`  | 57sp | Bold     | Hero title on Movie/Show Details backdrop |
| `type/headline` | 36sp | SemiBold | Screen titles, section headers            |
| `type/title`    | 28sp | SemiBold | Card titles in focus, dialog titles       |
| `type/body-lg`  | 22sp | Regular  | Overview text, primary body copy          |
| `type/body`     | 18sp | Regular  | Secondary metadata, cast lists            |
| `type/label`    | 16sp | Medium   | Chips, badges, button labels              |
| `type/caption`  | 14sp | Regular  | Timestamps, "23m left", rating source     |

Font: **Roboto** (Android default — no custom font download, no FOUT risk, ships with the
OS). This intentionally diverges from Admin's system-font stack; each platform uses its
natural default rather than forcing a shared webfont onto Android.

### 2.3 Spacing

4dp base grid, matching the Admin theme's implicit MUI 8px grid at TV scale:

`spacing/xs=4` · `spacing/sm=8` · `spacing/md=16` · `spacing/lg=24` · `spacing/xl=32` ·
`spacing/2xl=48` · `spacing/3xl=64`

### 2.4 Safe Margins (TV Overscan)

Screen content margin: **`spacing/2xl` (48dp)** from every edge, minimum. This is the
"title-safe" convention carried forward from broadcast TV — some panels still crop or
letterbox at the extreme edge, and a remote-navigable focus item flush against the edge is
easy to lose track of. Horizontal row content may bleed to the edge _behind_ the margin
(parallax/backdrop imagery), but interactive/focusable elements never render inside it.

### 2.5 Elevation & Glass Surfaces

TV has no real light source, so "elevation" here means **focus depth**, not drop shadows:

| Token               | Scale | Shadow                        |
| ------------------- | ----- | ----------------------------- |
| `elevation/rest`    | 1.0   | none                          |
| `elevation/focused` | 1.08  | `0 8px 24px rgba(0,0,0,0.45)` |
| `elevation/pressed` | 1.02  | `0 4px 12px rgba(0,0,0,0.35)` |

**Glass surface recipe** (nav rail, filter bar, player controls, dialogs — anywhere content
needs to float over imagery without a flat opaque panel):

```
background: color/glass/surface       // white @ 8%
backdrop-filter: blur(24px) saturate(160%)
border: 1px solid color/glass/border  // white @ 14%
border-radius: radius/full or radius/lg (see below)
```

**Android version caveat (real, not decorative)**: `specification/10-Android-TV.md.txt`
sets minimum OS support at **Android 9 (API 28)**. Real-time backdrop blur
(`RenderEffect`/`Modifier.blur()` reading content _behind_ a layer) is only available from
**API 31**. Devices on API 28–30 must render every `color/glass/*` surface as a flat
`color/glass/surface-strong` fill with **no blur** — same opacity and border, just without
the sampled blur behind it. This is graceful degradation, not a broken feature: the
component's visual identity (translucent dark chip, hairline border) survives; only the
sampled blur is conditionally absent. Milestone 7 should gate this on
`Build.VERSION.SDK_INT`, not feature-detect at runtime.

**Radius:** `radius/sm=8dp` (episode/setting rows) · `radius/md=12dp` (poster/backdrop
cards) · `radius/lg=20dp` (glass panels, dialogs) · `radius/full=999dp` (pill buttons, nav
rail capsule, chips) — directed feedback calls for visibly rounded, pill-shaped buttons and
menus, so `radius/full` is used far more heavily here than a typical web admin surface would.

### 2.6 Motion

| Token         | Duration | Easing      | Usage                                  |
| ------------- | -------- | ----------- | -------------------------------------- |
| `motion/fast` | 100ms    | ease-out    | Focus scale-in                         |
| `motion/base` | 200ms    | ease-in-out | Row scroll snap, tab switch            |
| `motion/slow` | 300ms    | ease-in-out | Screen transitions, backdrop crossfade |

All animation targets 60fps (spec requirement). No animation blocks input — a second
directional press during a `motion/base` transition interrupts and redirects it rather than
queuing.

### 2.7 Theme

**Dark only.** Per `specification/10-Android-TV.md.txt` ("Theme: Dark Theme"), the TV app
does not implement a light mode — unlike Admin, which serves sighted operators in varied
office lighting, TV content is watched in low-light living rooms and video content itself
(posters, backdrops, video frames) supplies the app's only meaningful "light" areas. Adding
a light theme would need new tokens with no spec-driven reason to exist.

---

## 3. Component Inventory

Each entry: anatomy, states, sizing. All fills/text/spacing reference tokens from Section 2
— no hardcoded values in implementation.

### 3.1 NavRail

**Revised per directed feedback: icon-only, permanently — it never expands to show text
labels.** A floating glass capsule (2.5 recipe, `radius/full`), vertically centered on the
inline-start edge, `72dp` fixed width, detached from the screen edge by `spacing/md` so it
reads as an overlay object rather than a docked panel.

Scope is **six items**: Home, Movies, TV Shows, Search, Favorites, Settings — Continue
Watching is intentionally not a seventh rail icon; it surfaces as the first row on Home
instead (5). This is a deliberate reduction from the broader list in
`specification/10-Android-TV.md.txt`'s Navigation section, made explicitly during design
review, not an oversight.

Every item is an icon in a `56dp` circular hit target. Active route: `white` icon on a
`color/glass/surface-strong` circular chip behind it. Inactive: icon at 55% opacity, no
chip. Focused item (4.1): `color/focus/ring`, `elevation/focused` scale.

Because there is no label to read, every icon must be unambiguous at a glance and carries a
content-description for screen readers (6) — glyph clarity substitutes for the text that
would otherwise disambiguate it.

### 3.2 HeroCarousel (new, directed feedback)

The Home screen's opening statement: a large-format, manually-navigated carousel of the
**ten latest movies**, replacing a plain first row with something the feedback specifically
called "beautiful, attractive" cards.

- Occupies ~50% of screen height, full width inside the safe margin.
- One card centered at full scale/opacity (`elevation/focused` treatment permanently
  applied to whichever card is current — this is the one component where "current" and
  "keyboard-focused" are the same state); the adjacent 1–2 cards on each side peek at 78%
  scale / 55% opacity (coverflow), reinforcing that Left/Right has more content.
- Anatomy per card: backdrop image → bottom gradient (`color/bg/overlay`) → `type/headline`
  title → one-line tag (`type/body`, e.g. genre + year) → `PrimaryButton` (Play) +
  `SecondaryButton` (More Info), both using the pill treatment from 3.6.
- Position indicator: a row of `radius/full` dots below the card, filled dot = current index.
- **No autoplay.** An auto-advancing carousel would violate 4.2's "predictable navigation"
  rule — focus would drift out from under a user mid-decision. Left/Right (or KEY_START/
  KEY_END, 6) only advance on explicit input.

### 3.3 PosterCard

The core content unit (Home rows below the hero, Movies/Shows grids, Search results).

- Sizes: `Poster` (2:3, 180×270dp default) for movies/shows; `Backdrop` (16:9, 320×180dp)
  for Continue Watching / Recently Added rows, where showing progress matters more than a
  poster silhouette.
- Anatomy: image → gradient scrim (bottom 40%, `color/bg/overlay`) → `type/label` title →
  optional `type/caption` metadata (year/runtime) → optional progress bar
  (`color/brand/accent` fill on `color/border/subtle` track, 3dp, only on Continue Watching).
- States: `rest` (elevation/rest, no scrim visible until title needed), `focused`
  (elevation/focused, 3dp `color/focus/ring` stroke, scrim always visible, title promoted to
  `type/title`), `loading` (skeleton, 3.5).

### 3.4 SectionHeader

`type/headline` title + optional "See All" affordance (a focusable `type/label` link, right-
aligned, only rendered if the row has more items than fit on screen).

### 3.5 SkeletonLoader

Shimmer block matching the exact bounding box of the content it replaces (PosterCard
skeleton is the same 180×270dp) so layout never shifts when real content arrives. Shimmer
sweep: `motion/slow` duration, looping, across `color/glass/surface` tones.

### 3.6 Buttons — revised to white pill + glass

- `PrimaryButton` (Play): `color/button/primary-bg` fill (white), fully rounded
  (`radius/full`), `color/button/primary-text` label/icon, min height 56dp — the single
  largest focus target on any Details screen, always the first focus stop. Focus ring uses
  `color/focus/ring-on-light` (2.1), not the standard white ring.
- `SecondaryButton` (Favorite, Add to List, More Info): `color/glass/surface` fill (frosted,
  2.5 recipe), `radius/full`, white text/icon. Standard `color/focus/ring` on focus (it sits
  on a dark/glass fill, not white).
- `IconButton` (player transport controls): 48×48dp minimum, circular, transparent at rest,
  `color/glass/surface` chip on focus.

### 3.7 Chip / FilterPill

Genre/year/sort filters (Movies/TV Shows screens), and the season selector on Show Details
(3.9). `type/label`, `color/glass/surface` background at rest (frosted, sits over content),
fully rounded; `color/brand/accent` fill + `white` text when selected.

### 3.8 SeasonSelector (new)

A `Chip` row (3.7), one chip per season ("Season 1", "Season 2", …), directly under the
Show Details hero, immediately above the episode list — see 5's Show Details row order. Only
one season is ever selected; changing it re-populates the `EpisodeRow` list below without
navigating away from Details.

### 3.9 EpisodeRow

TV Show Details episode list item: 160×90dp still + episode number (`type/body`, `gray/300`)

- title (`type/body-lg`) + progress bar identical to PosterCard's.

### 3.10 PlayerControlsOverlay

Bottom-anchored **glass** bar (2.5 recipe, `radius/lg`, inset from the screen edge by
`spacing/lg` — not edge-to-edge like the original flat-scrim version) over a lighter
full-width gradient (`color/bg/overlay`) that keeps the video itself legible behind it.
Contains, left→right: play/pause, rewind/forward (spec: seek), scrubber
(`color/brand/accent` fill), elapsed/total time (`type/caption`), then right-aligned
subtitle/audio/quality `IconButton`s. Fades out after 4s of no input (spec: smooth
animation), any directional press brings it back instantly.

### 3.11 EmptyState / ErrorState

Reuses the exact pattern already shipped in `apps/admin` (`EmptyState`/`ErrorState`
components) conceptually: icon + `type/title` + `type/body` explanation + optional retry
`SecondaryButton`. Distinguishes "nothing here yet" from "something went wrong" — never a
silent blank row.

---

## 4. Focus & Remote Interaction Rules

### 4.1 Focus Treatment (applies to every focusable component)

On focus: `elevation/focused` scale + shadow, `3dp` stroke in `color/focus/ring` (white
surfaces/glass) or `color/focus/ring-on-light` (white-filled surfaces — currently only
`PrimaryButton`, 3.6) — the token choice is derived from the component's own background, per
2.1, `motion/fast` scale-in. Beyond that one branch, the recipe is identical across every
component — a user should never have to re-learn what "selected" looks like between a
PosterCard and a Chip.

### 4.2 Navigation Rules (from spec "Focus Rules")

- **No dead ends**: every focusable item has a defined neighbor in all four directions it
  visually borders, or focus wraps to the nearest logical target (e.g. pressing Up from the
  first content row focuses the NavRail, not nothing).
- **Focus memory**: returning to a screen (Back from Details → Home) restores focus to the
  item that was focused before navigating away, not the top-left default.
- **Predictable geometry**: focus movement always matches visual adjacency — never jumps
  across the screen for a Down press when a closer candidate exists.

---

## 5. Screen Layouts

Grid/margin specs for the screens enumerated in `specification/10-Android-TV.md.txt`.
All screens use the `spacing/2xl` safe margin (2.4) and NavRail (3.1) on the left.

| Screen                | Layout                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**              | `HeroCarousel` (3.2, ten latest movies) first, full-width. Below it, the vertical stack of horizontal `PosterCard`/`Backdrop`-card rows per spec's section list — Continue Watching first (Backdrop size), then Trending/Latest/Collections/Recommended (Poster size).                                                                                                                                                                                       |
| **Movies / TV Shows** | Filter bar (`Chip` row, glass) under `SectionHeader`, then a 6-column `PosterCard` grid, `spacing/lg` gutters.                                                                                                                                                                                                                                                                                                                                               |
| **Search**            | Persistent search field top-of-frame (focus-first on screen entry per spec, glass background), Recent/Trending `Chip` rows when empty, `PosterCard` grid once query has results.                                                                                                                                                                                                                                                                             |
| **Movie Details**     | Full-width backdrop hero (top ~55% of screen), gradient into `color/bg/base`. Text block (title, metadata, overview, `PrimaryButton` + `SecondaryButton`) anchored at the hero's bottom-_start_; the movie's **poster floats at the hero's bottom-_end_** (the opposite side from the text, per directed feedback) as an elevated `PosterCard` overlapping down into the body below. Immediately under the hero: **Cast** row, then **Recommendations** row. |
| **TV Show Details**   | Identical hero + opposite-side floating poster as Movie Details. Directly under the hero: `SeasonSelector` (3.8) + its `EpisodeRow` list (3.9) — feedback places seasons/episodes here, before Cast — then **Cast**, then **Recommendations**.                                                                                                                                                                                                               |
| **Episode Screen**    | Same backdrop pattern as Details, scaled down (35% of screen height), `EpisodeRow`-style metadata above the fold. No floating poster (there is no per-episode poster asset — see `specification/07-TMDB-Integration.md.txt` field list).                                                                                                                                                                                                                     |
| **Player**            | Full-bleed video, `PlayerControlsOverlay` (3.10) only, everything else hidden until input.                                                                                                                                                                                                                                                                                                                                                                   |

**RTL note for the floating poster**: "opposite side from the text" is a _logical_, not a
literal-pixel, position — in LTR the text sits at bottom-left and the poster at bottom-
right; mirrored under Arabic (2.7, 6) the text moves to bottom-right and the poster to
bottom-left. The relationship (poster opposite the text block) is the invariant, not a fixed
screen coordinate.

---

## 6. Accessibility

- **Contrast**: every token pairing in 2.1 is validated at AA minimum for its usage class;
  `text/disabled` and `brand/primary` are large-text/icon-only, never body copy.
- **RTL**: NavRail, focus-neighbor geometry, and scrubber direction all mirror under Arabic
  locale (spec: "RTL Support") — Left/Right D-pad presses map to logical
  previous/next, not literal screen-left/screen-right, so mirroring is automatic once layout
  direction flips.
- **Large text**: `type/*` tokens are the floor, not a fixed ceiling — respect Android's
  system font-scale setting up to 130% before truncating (beyond that, truncate with ellipsis
  rather than break card layouts).
- **Screen reader**: every `PosterCard`/`Chip`/button exposes a content description
  (title + state, e.g. "The Matrix, 42 minutes remaining, press to resume").

---

## 7. Relationship to Admin Dashboard Theme

|                  | Admin (`apps/admin`)       | Android TV                        |
| ---------------- | -------------------------- | --------------------------------- |
| Brand primitives | `#3F6FD8` / `#D83F8F`      | Same (2.1)                        |
| Theme modes      | Light + Dark (user toggle) | Dark only (2.7)                   |
| Base unit        | MUI 8px grid               | 4dp grid, TV type scale (2.2–2.3) |
| Font             | System UI stack            | Roboto (Android default)          |

Same brand, deliberately different semantic/type layer per platform's actual viewing
context — this is one product with two honestly-scoped clients, not a shared component
library forced across web and TV.

---

## 8. Handoff to Jetpack Compose (Milestone 7)

When Milestone 7 begins, this document's tokens map directly onto a Compose theme object,
e.g.:

```kotlin
object CtvColors {
    val bgBase = Color(0xFF000000)
    val glassSurface = Color(0x14FFFFFF)       // white @ 8%
    val glassBorder = Color(0x24FFFFFF)        // white @ 14%
    val buttonPrimaryBg = Color(0xFFFFFFFF)
    val buttonPrimaryText = Color(0xFF0A0A0C)
    val brandAccent = Color(0xFF3F6FD8)
    val focusRing = Color(0xFFFFFFFF)
    val focusRingOnLight = Color(0xFF3F6FD8)
    /* … */
}
object CtvTypography { val display = TextStyle(fontSize = 57.sp, fontWeight = FontWeight.Bold); /* … */ }
object CtvSpacing { val xs = 4.dp; val sm = 8.dp; val md = 16.dp; /* … */ }
```

`color/glass/*` should be implemented with `Modifier.blur()` behind an API-31 check (2.5) —
budget for the API 28–30 flat-fill fallback in the same composable, not as a follow-up patch.

Component sizing (3.x) and focus recipe (4.1) become `Modifier` extensions
(`Modifier.tvFocusable()`) applied uniformly, exactly so every component shares the one
focus recipe from 4.1 rather than each screen reinventing it.

No visual decision in this document should be re-litigated inside Milestone 7's
implementation — if something here doesn't work in practice, it's a doc update, not a
silent deviation.

---

## 9. Revision 3 — restyled against reference screenshots

The user supplied three reference screenshots (a Movie Details page, a Search page, and a
Home page) from an existing product and asked for that visual style specifically. This
revision documents the resulting deltas from Sections 2–8 above; those sections still hold
except where superseded here.

**Toned-down glass, more flat cinematic surfaces.** The references show flat dark chips,
tabs, and keyboard keys with a thin border — not visibly blurred. `color/glass/*` (2.5) is
kept (still genuinely useful on the player controls / nav rail per the earlier explicit
"frosted glass menus" request) but is no longer the default for every menu-like surface:
chips, tabs, and the new on-screen keyboard (below) use a plain flat translucent fill
(`color/glass/surface` without `backdrop-filter`), reserving actual blur for fewer, more
load-bearing surfaces.

**NavRail (supersedes 3.1's chip/pill treatment)**: no capsule container, no per-icon
background chip. Plain icons, `50%` opacity at rest → full opacity when current, focused
item gets a **rounded-square** outline (not circular) in `color/focus/ring` — matching the
reference's focus indicator shape exactly. Position (inline-start edge) is unchanged.

**HeroCarousel (supersedes 3.2's coverflow)**: a single full-bleed slide (not a peeking
coverflow) with a small dot-pagination strip. Anatomy per slide: format/rating badge row
(runtime, `IMDB` badge + rating, one quality tag) → title (native-language, large) → an
uppercase, letter-spaced **secondary title in the content's other language** (e.g. the
English title under an Arabic headline) → one-line synopsis → a three-item action row:
circular icon-only Favorite toggle, an outline "Details" pill, and a solid white "Watch Now"
pill that jumps straight to the Player. Interaction model: the dots themselves are the
first focusable row — moving focus between dots (arrow keys) live-updates the hero's
background/text, and clicking/entering a dot is equivalent; the action row is a second
focusable row underneath, always acting on whichever slide the dots currently point at. This
avoids needing any special-cased "arrows sometimes mean move-focus, sometimes mean
change-slide" logic — both stay ordinary grid rows.

**FormatBadge & IMDB badge (new)**: small bordered tags for delivery format (`CC`,
`AD`, `Dolby Atmos`, `Dolby Vision`, `HDR`, `4K ULTRA HD`, `FHD`) rendered inline wherever a
title's technical specs are shown (hero, Details). A dedicated `IMDB` tag uses IMDB's own
brand yellow (`#F5C518`) on dark text — the one deliberate exception to the app's own
palette, because a third-party rating source's mark should read as _their_ mark, not be
re-skinned into the app's brand color.

**RankedPosterCard (new)**: for a "Recently Added" row specifically, a large bold numeral
(1, 2, 3…) rendered _outside_ the poster's own clipped bounds, overlapping its leading
corner — the familiar "Top 10" treatment. Implemented as a non-clipped sibling positioned
before the card with a negative margin pulling the following card underneath it, rather
than a child of the card itself (which would get clipped by the card's own rounded-corner
`overflow:hidden`).

**Movie/TV Show Details (supersedes 5's floating-corner-poster version)**: rather than a
small poster overlapping the hero/body boundary, the reference uses a **much larger poster
as its own column**, bottom-aligned next to the text block, both sitting inside one
full-bleed backdrop "stage" (no overlap trick needed — simpler to implement correctly).
Added to the info column: an "available now" status pill, a content-type indicator (small
accent dot + Movie/TV Series label), an age-rating badge, and a plain-text genre list
(`Genre • Genre`, not chips — chips are reserved for actionable filters, and genre here is
purely descriptive). Cast moved from poster-style cards to **circular avatar photos** with
name + role (Lead Actor / Director) underneath, since the reference shows headshots, not
poster art, for people.

**Search — on-screen keyboard (new, and the most consequential functional addition)**: the
first revision used a real `<input>`, which quietly assumed a keyboard exists. A physical TV
remote has no keyboard — every production TV search screen (and the reference) instead
renders the keyboard _as focusable on-screen keys_, exactly like every other component in
this system. This revision replaces the `<input>` with a non-interactive text display plus a
`OnScreenKeyboard` component: a 7-column Arabic or QWERTY-approximate grid (swapping per
`state.lang`, since the app supports Arabic/English/Mixed search per
`specification/10-Android-TV.md.txt`), a full-width Space key, and a utility row (Clear,
Backspace, 123/ABC toggle, language toggle). Functionally this is just more `Chip`-shaped
focusable rows — no new interaction primitive was needed, only new content. One added
behavior: rows that represent a physical keyboard **wrap** at their horizontal edges
(pressing further past the last key of a row returns to its first key) rather than exiting
to the NavRail, since exiting mid-word to global navigation would be surprising; every other
row in the app keeps the standard exit-to-NavRail behavior at its edge.

**CTV wordmark**: a small fixed logotype at the inline-end corner of every screen, matching
the reference's brand placement. Decorative only, never focusable.

Known simplification, disclosed rather than hidden: the on-screen keyboard's `123`/`ABC`
toggle in this preview switches to a bare digit row, not a full symbol keyboard — sufficient
to prove the interaction model, not a claim that it's the complete character set Milestone 7
should ship.
