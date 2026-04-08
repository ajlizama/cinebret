# CineBret · Group A Redesign — Information Architecture

**Phase 3 of the `/design-flow`** · Status: draft for approval

This document maps the patterns shared across the 11 Group A pages and proposes the v1 component library that they will all share. The goal is to avoid 11 different implementations of the same idea.

---

## 1. Universal page anatomy

Every Group A page follows the same vertical anatomy:

```
┌────────────────────────────────────┐
│ TopNav (universal, sticky)         │  ← always visible
├────────────────────────────────────┤
│ PageShell (max-w + padding)        │
│ ┌────────────────────────────────┐ │
│ │ BackButton (optional)          │ │  ← when navigating from another page
│ │ PageHeader                     │ │  ← title + subtitle + actions
│ │ ┌───────────┐                  │ │
│ │ │ Section A │                  │ │
│ │ └───────────┘                  │ │
│ │ ┌───────────┐                  │ │
│ │ │ Section B │                  │ │
│ │ └───────────┘                  │ │
│ │ ...                            │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

For full-bleed pages (`/reel`, `/cinereels`, `/mapa`) the PageShell is bypassed and the page content fills 100dvh, but the TopNav stays at top.

---

## 2. Patterns observed across pages

### 2.1 Page header patterns

| Page | Title | Subtitle | Inline actions |
|---|---|---|---|
| `/reel` | "Tinder" (implied) | — | Mode toggle (in TopNav) |
| `/comunidad` | "Comunidad CineBret" | "Reviews de cinéfilos chilenos" | — |
| `/cinereels` | — (full-bleed) | — | — |
| `/mapa` | "Mapa de conexiones" | "Explorá las relaciones entre películas" | Search, IMDB filter |
| `/cast-crew` | "Cast & Crew" | "Actores, directores y compositores" | Tabs, Search |
| `/trailers` | "Trailers & Clips" | "X videos disponibles" | Search |
| `/estrenos` | "Calendario de Estrenos" | "Cine y streaming en Chile" | Filter chips |
| `/musica` | "Música & Soundtracks" | "Bandas sonoras de tus películas favoritas" | Search, genre filter |
| `/cinequest` | "CineQuest" | "Desafíos cinéfilos" | — |
| `/calculadora` | "¿Qué plataforma me conviene?" | "Recomendador personalizado" | — |
| `/estadisticas` | "Estadísticas del catálogo" | "Cómo se compara cada plataforma" | — |

**Conclusion**: PageHeader needs to support: title, optional subtitle, optional right-side actions slot (for filters/tabs/search), optional inline stat (count or summary).

### 2.2 Section patterns

Within a page, content groups into sections. Examples:

- `/comunidad`: "Explorar perfiles", "Reviews", "Reviews de CineBret"
- `/trailers`: "Próximamente", "Trending", "Catálogo"
- `/musica`: just one big list
- `/cast-crew`: per tab, one big list
- `/calculadora`: per platform, a card
- `/estadisticas`: per platform, a card with stats inside

**Conclusion**: Section needs: small uppercase label (label slot), optional count badge, optional right-side action (collapse, see all, etc), and a content slot.

### 2.3 Card patterns

The audit identified 6 distinct card types. The v1 library will provide a base `<Card>` plus 4 specialized variants:

| Variant | Used in | Layout |
|---|---|---|
| **Card** (base) | Generic surface, used by everything | rounded-2xl, bg-zinc-900, padding configurable |
| **MoviePosterCard** | `/comunidad` (feed), `/trailers`, `/musica`, `/cinereels`, `/estrenos`, `/calculadora` (results), `/posters`, `/fusionador` results | Vertical: poster + title + metadata below |
| **PersonCard** | `/cast-crew`, future actor/director pages | Avatar (round) + name + stats row |
| **StatCard** | `/cinequest`, `/calculadora`, `/estadisticas`, `/perfil` | Big number + label + optional sublabel |
| **ReviewCard** | `/comunidad`, `/pelicula/[id]/ReviewSection` | Avatar + username + timestamp + review text + actions |
| **AchievementCard** | `/cinequest` | Icon + name + description + tier badge + progress |

The first three (Card, MoviePosterCard, PersonCard) are the most reused. StatCard, ReviewCard, AchievementCard are still v1 because they appear in 2+ places each.

### 2.4 Button patterns

Audit found 4 distinct button styles across pages:

1. **Primary** — gold background (`bg-yellow-400`), dark text, used for main CTA per page
2. **Secondary** — transparent + gold border + gold text, used for alt CTA
3. **Ghost** — transparent + zinc text, used for tertiary actions ("Cancelar", "Ver más")
4. **Icon** — square 44x44, just an icon, used for filters/share/close

The v1 `<Button>` component will provide all 4 via a `variant` prop. `<IconButton>` is a thin wrapper for icon-only.

### 2.5 Tag/Pill/Chip patterns

Multiple uses of small inline elements:

- **Genre tag** — gold/zinc text on subtle bg, used in `/comunidad`, `/trailers`, `/cast-crew`, `/musica`, `/calculadora`
- **Status badge** — colored pill with icon, used in `/estrenos` (status), `/cinequest` (tier)
- **Filter chip** — toggleable, gold when active, used in `/estrenos`, `/musica`, `/comunidad`
- **Count badge** — small number, used in `/trailers`, `/comunidad`, `/cast-crew`

The v1 `<Pill>` component handles all of these via `variant`, `active`, `icon` props.

### 2.6 Input patterns

- **Search input** — text + magnifier icon, found in `/cast-crew`, `/trailers`, `/musica`, `/mapa`, `/comunidad` (in TopNav)
- **Text input** — basic input, used in forms across pages
- **Select** — dropdown, used in `/musica` (genre filter)

The v1 `<SearchInput>` standardizes the magnifier-prefixed text input. Generic text inputs use raw `<input>` styled with the design tokens.

### 2.7 Tabs pattern

- `/cast-crew` — 3 tabs (Actores / Directores / Compositores)
- Future pages (the Group B games) — 4-7 tabs for game modes

The v1 `<Tabs>` provides a consistent gold-underline-on-active style.

### 2.8 Loading / Empty / Error patterns

Audit found 7 different loading implementations and 0-2 empty/error states per page. The v1 standardizes:

- `<LoadingState>` — spinner + optional text, fills container
- `<EmptyState>` — icon + headline + description + optional CTA
- `<ErrorState>` — error icon + headline + description + retry button

### 2.9 Data display patterns

Specialized display elements that appear in multiple pages:

- **ScoreBadge** (IMDB/RT/MC) — colored circle with score, used in `/reel`, `/comunidad`, `/trailers`, `/cast-crew`, `/musica`, `/calculadora`, `/estrenos`. v1: `<ScoreBadge source="imdb|rt|mc" value={8.5} />`
- **PlatformLogo** — small square with white bg + platform image, used everywhere. v1: `<PlatformLogo platform="netflix" size="sm|md|lg" />`
- **ProgressBar** — animated bar with optional label, used in `/cinequest`, `/calculadora`. v1: `<ProgressBar value={75} max={100} color="gold" />`

### 2.10 Modal/overlay pattern

Used in `/reel` (onboarding, guest limit), `/comunidad` (cuestionario), `/posters` (movie detail), `/conexion` (chooser), `/juntos` (none, full-page wizard).

v1 `<Modal>` standardizes: backdrop blur, centered card, close button, framer-motion entrance/exit.

---

## 3. v1 Component Library

Final list, locked. Anything not on this list waits for v2.

### 3.1 Layout primitives

| Component | Purpose | Props |
|---|---|---|
| `<PageShell>` | Wraps page content with TopNav + container + padding | `children`, `fullBleed?: boolean`, `maxWidth?: 'lg'\|'xl'\|'2xl'\|'7xl'` |
| `<PageHeader>` | Page title + subtitle + actions slot | `title`, `subtitle?`, `actions?: ReactNode`, `count?: number`, `icon?: ReactNode` |
| `<Section>` | Sub-section wrapper with label + content | `label?`, `count?`, `action?: ReactNode`, `children` |
| `<BackButton>` | Standard "Volver" button | `href?`, `label?` (default: "Volver") |

### 3.2 Surface primitives

| Component | Purpose | Props |
|---|---|---|
| `<Card>` | Base dark surface, configurable | `children`, `padding?`, `interactive?: boolean`, `className?` |
| `<MoviePosterCard>` | Poster + title + metadata vertical | `movie: Movie`, `size?: 'sm'\|'md'\|'lg'`, `showRating?`, `showYear?`, `showPlatforms?`, `onClick?` |
| `<PersonCard>` | Avatar + name + stats row | `person`, `subtitle?`, `right?: ReactNode`, `expandable?: boolean` |
| `<StatCard>` | Big number + label | `value`, `label`, `sub?`, `color?: 'gold'\|'white'\|'green'\|'red'` |
| `<ReviewCard>` | Review with author + text + actions | `review`, `actions?: ReactNode` |
| `<AchievementCard>` | Achievement with icon + tier + progress | `achievement`, `unlocked`, `progress?`, `tier?` |

### 3.3 Form & control primitives

| Component | Purpose | Props |
|---|---|---|
| `<Button>` | Primary action button | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size?`, `loading?`, `iconLeft?`, `iconRight?`, all native button props |
| `<IconButton>` | Square icon-only button | `icon`, `label` (aria-label), `variant?`, `size?` |
| `<SearchInput>` | Text input with magnifier | `value`, `onChange`, `placeholder?`, `onClear?` |
| `<Tabs>` | Horizontal tabs with gold underline | `tabs: {key, label, count?}[]`, `value`, `onChange` |
| `<FilterChips>` | Toggleable horizontal chips | `chips: {key, label, count?}[]`, `value: string\|string[]`, `onChange`, `multi?: boolean` |

### 3.4 Display primitives

| Component | Purpose | Props |
|---|---|---|
| `<Pill>` | Generic small label | `children`, `variant?: 'default'\|'gold'\|'success'\|'warning'\|'danger'`, `icon?`, `active?` |
| `<ScoreBadge>` | IMDB / RT / MC score | `source: 'imdb'\|'rt'\|'mc'`, `value: number`, `size?` |
| `<PlatformLogo>` | Platform icon | `platform: string`, `size?: 'sm'\|'md'\|'lg'`, `className?` |
| `<ProgressBar>` | Animated progress bar | `value`, `max?`, `color?`, `label?` |

### 3.5 State primitives

| Component | Purpose | Props |
|---|---|---|
| `<LoadingState>` | Centered spinner + text | `text?`, `size?` |
| `<EmptyState>` | Icon + message + CTA | `icon?`, `title`, `description?`, `action?: ReactNode` |
| `<ErrorState>` | Error display + retry | `title?`, `description?`, `onRetry?` |
| `<Skeleton>` | Loading placeholder | `width?`, `height?`, `className?` |

### 3.6 Overlay primitives

| Component | Purpose | Props |
|---|---|---|
| `<Modal>` | Centered modal with backdrop | `open`, `onClose`, `title?`, `children`, `size?` |
| `<Sheet>` | Bottom sheet (mobile) | `open`, `onClose`, `children` |

---

## 4. Component dependency graph

```
PageShell
  └── TopNav (existing)
  └── (children)

PageHeader, Section, BackButton — independent

Card (base)
  ├── MoviePosterCard ──── ScoreBadge, PlatformLogo, Pill
  ├── PersonCard ─────── (no deps)
  ├── StatCard ───────── (no deps)
  ├── ReviewCard ──────── Pill, Button
  └── AchievementCard ── Pill, ProgressBar

Button ─── (no deps, uses tokens)
IconButton ─── extends Button
SearchInput ─── (no deps)
Tabs ─── (no deps)
FilterChips ─── Pill (variant=filter)

Pill ─── (no deps)
ScoreBadge ─── (no deps)
PlatformLogo ─── (no deps, uses /public images)
ProgressBar ─── (no deps)

LoadingState ─── (uses /loading.mp4)
EmptyState ─── Button (for CTA)
ErrorState ─── Button (for retry)
Skeleton ─── (no deps)

Modal ─── framer-motion
Sheet ─── framer-motion
```

**Total v1 components: 22**. About half are leaf components with no dependencies (good for testing in isolation).

---

## 5. File structure

```
/components/ui/
  ├── PageShell.tsx
  ├── PageHeader.tsx
  ├── Section.tsx
  ├── BackButton.tsx
  ├── Card.tsx
  ├── MoviePosterCard.tsx
  ├── PersonCard.tsx
  ├── StatCard.tsx
  ├── ReviewCard.tsx
  ├── AchievementCard.tsx
  ├── Button.tsx
  ├── IconButton.tsx
  ├── SearchInput.tsx
  ├── Tabs.tsx
  ├── FilterChips.tsx
  ├── Pill.tsx
  ├── ScoreBadge.tsx
  ├── PlatformLogo.tsx
  ├── ProgressBar.tsx
  ├── LoadingState.tsx
  ├── EmptyState.tsx
  ├── ErrorState.tsx
  ├── Skeleton.tsx
  ├── Modal.tsx
  ├── Sheet.tsx
  ├── icons.tsx          // shared SVG icon set (Heroicons-style)
  └── index.ts           // barrel export

/lib/design/
  ├── tokens.ts          // color, spacing, typography constants
  └── motion.ts          // shared framer-motion variants
```

**Why a barrel export:** Pages import like `import { PageShell, PageHeader, MoviePosterCard, Pill, Button } from '@/components/ui'`. Cleaner than 5 separate imports.

---

## 6. Page-by-page composition (preview)

This is what each redesigned page will look like in terms of which v1 components it uses. Helpful for the batching plan in Phase 5.

### `/reel` — Tinder
```
PageShell fullBleed
  TopNav
  ReelCard (specialized, NOT in v1 — keeps its swipe state machine)
    - ScoreBadge (IMDB/RT/MC)
    - PlatformLogo
    - Pill (genre, category)
    - IconButton (otra película)
  ActionButtonsBar (specialized)
    - IconButton x3 (paso, ya la vi, watchlist)
  GuestLimitModal (existing, will use Modal v1)
```

### `/comunidad`
```
PageShell
  PageHeader title="Comunidad CineBret"
  Section label="Explorar perfiles" (collapsible)
    PersonCard x N (each with follow button via Button)
  Section label="Feed"
    ReviewCard x N (each with Button actions, MoviePosterCard inside)
  Modal (Cuestionario)
```

### `/cinereels`
```
PageShell fullBleed
  TopNav
  ReelsPlayer (specialized)
    - PlatformLogo
    - Pill (categoria)
  IconButton x4 (right column: Ya la vi, Watchlist, Info, Compartir)
```

### `/mapa`
```
PageShell fullBleed
  TopNav
  MapCanvas (specialized, react-force-graph-2d)
  Floating SearchInput (top-left)
  Floating IconButton group (controls)
  Sheet (movie info, mobile)
  Modal (onboarding)
```

### `/cast-crew`
```
PageShell
  PageHeader title="Cast & Crew"
  Tabs (Actores / Directores / Compositores)
  SearchInput
  Section
    PersonCard x N (expandable, with poster grid inside)
      MoviePosterCard x 5 (when expanded)
```

### `/trailers`
```
PageShell
  PageHeader title="Trailers & Clips"
  SearchInput
  Section label="Próximamente"
    Grid of MoviePosterCard variant=video x N
  Section label="Trending"
    Grid of MoviePosterCard variant=video x N
  Section label="Catálogo"
    Grid of MoviePosterCard variant=video x N
```

### `/estrenos`
```
PageShell
  PageHeader title="Calendario de Estrenos"
  FilterChips (Todos / En cines / Próximamente / Streaming)
  Section label="<Mes>" x N
    Grid of MoviePosterCard variant=release x N (with status pill + reminder button)
```

### `/musica`
```
PageShell
  PageHeader title="Música & Soundtracks"
  SearchInput
  FilterChips (genres)
  Section
    List of MoviePosterCard variant=horizontal x N
      Click to expand → Spotify embed inside Card
```

### `/cinequest`
```
PageShell
  PageHeader title="CineQuest" subtitle + LevelBadge
  Section label="Resumen"
    Grid of StatCard x 4 (achievements unlocked, movies watched, avg rating, genres)
  Section label="Logros"
    Grid of AchievementCard x N
```

### `/calculadora`
```
PageShell
  PageHeader title="¿Qué plataforma te conviene?"
  Card (top recommendation banner, when applicable)
  List of Card variant=platform-result x 8
    PlatformLogo + StatCard inline + ProgressBar + Pill (recommendation)
```

### `/estadisticas`
```
PageShell
  PageHeader title="Estadísticas del catálogo"
  Section label="Análisis IA" (when available)
    Card x N
  Section label="Comparativa"
    List of Card variant=platform-stats x 8
      PlatformLogo + StackedBar (specialized) + StatCard inline
```

---

## 7. Specialized components (NOT in v1, page-owned)

These are too page-specific to extract into shared components. They live with their page.

| Component | Page | Why specialized |
|---|---|---|
| `ReelCard` | `/reel` | Self-contained swipe state machine, 4 slides, gesture handlers |
| `MapCanvas` | `/mapa` | Wraps `react-force-graph-2d` with custom rendering |
| `ReelsPlayer` | `/cinereels` | YouTube IFrame API + intersection observer + drag scroll |
| `StackedBar` | `/estadisticas` | Multi-segment bar with hover tooltips |
| `OnboardingOverlay` | `/reel`, `/mapa` | Page-specific tutorial sequences |
| `GenreColorMap` | `/estadisticas` | 20+ genre → color mapping (data) |

---

## 8. Migration approach

For each page redesign:

1. **Read the current page** in full
2. **Inventory the elements** (header, sections, lists, cards, buttons, modals)
3. **Map each element to a v1 component** (or note if it needs to remain specialized)
4. **Refactor the JSX** to use v1 components, preserving all data and handlers
5. **Update copy** following the voice/tone rules (neutral Spanish, no banned phrases)
6. **Verify all functionality** works as before (manual check against the audit)
7. **Mobile audit** at 375px
8. **Build check** with `npx next build`

**No refactor of business logic.** Data fetching, state management, and interaction handlers stay exactly as they are. Only the JSX/styling changes.

---

## 9. Approval

Before moving to Phase 4 (build the v1 components), the user must confirm:

- [ ] The 22 components in section 3 are the right v1 set (not too many, not too few)
- [ ] The page-by-page composition in section 6 makes sense
- [ ] The migration approach in section 8 (refactor JSX only, no logic changes) is OK
- [ ] Specialized components in section 7 stay specialized (we don't try to genericize them)
- [ ] File structure in section 5 is fine

Once approved, Phase 4 builds all 22 components in `/components/ui/`. After that, Phase 5 batches the page redesigns.
