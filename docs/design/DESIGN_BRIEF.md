# CineBret · Group A Redesign — Design Brief

**Phase 2 of the `/design-flow`** · Author: design system overhaul · Status: draft for approval

---

## 1. Goal

Unify the visual and interactive language of the 11 secondary pages in CineBret (Group A) under a single premium dark + gold design system, AND elevate the graphic design quality of each page following the established design guidelines (ui-ux-pro-max skill, Anthropic Frontend Design principles, Vercel Web Design Guidelines). The pages currently feel like they were built at different times by different people with no shared vocabulary. The goal is to make the user feel "this is one polished product" wherever they navigate, with each page meeting a high bar of visual craft.

**Non-goal:** redesigning the landing/catálogo (`/catalogo`). That stays untouched.

---

## 2. Scope (11 pages, after housekeeping)

### To redesign

| # | Route | Name | Complexity | Notes |
|---|---|---|---|---|
| 1 | `/reel` | Tinder swipe | High | Preserve all swipe logic + 4 slides |
| 2 | `/comunidad` | Community feed | High | 670+ lines, many inline components |
| 3 | `/cinereels` | TikTok-style reels | Medium | Full-screen video player |
| 4 | `/mapa` | Movie graph | Medium | Force-graph viz |
| 5 | `/cast-crew` | Cast & Crew browser | Medium | Tabs + expandable rows |
| 6 | `/trailers` | Trailers gallery | Low-Medium | Grid + inline player |
| 7 | `/estrenos` | Releases calendar | Medium | Bug fixed during housekeeping |
| 8 | `/musica` | Soundtracks | Low-Medium | Spotify embeds |
| 9 | `/cinequest` | Achievements | Medium | Tier system |
| 10 | `/calculadora` | Platform recommender | Low-Medium | Match score cards |
| 11 | `/estadisticas` | Stats dashboard | High | 20+ genre colors to consolidate |

### Removed from scope (housekeeping done)

- `/juntos` (old) — **deleted**, replaced by `/juntos-nuevo` which was renamed to `/juntos`
- `/cambios` (Plataformas) — gated to admin only via `AdminGate`, hidden from menu for non-admins. Stays as-is visually, no redesign needed.

---

## 3. Audience

- **Primary**: Chilean movie enthusiasts on mobile (375px) using CineBret to discover what to watch and engage with the community.
- **Secondary**: Desktop users browsing on bigger screens.
- **Tertiary**: Admin (Alberto) using `/cambios`, `/admin`, `/estadisticas` for management.

The user is **already engaged** when they reach Group A (they navigated from the landing). They expect speed, polish, and a sense that "this part is also good", not a regression to a basic-looking dashboard.

---

## 4. Constraints

### Technical
- **Stack is fixed**: Next.js 16, Tailwind, Supabase, framer-motion (already installed)
- **No URL changes** — every existing route keeps its path so external links and bookmarks don't break
- **No data loss** — every feature, every data point identified in the audit must remain accessible. The redesign is purely the *how*, not the *what*
- **No new dependencies** unless absolutely necessary (we already have framer-motion, Image, supabase)
- **Performance**: Pages must remain interactive on mobile 4G. No new heavy libraries, no >200KB additions.

### Functional preservation (zero regressions allowed)
- `/reel`: 4 slides, swipe in 4 directions, onboarding, story bars, undo, guest limit, series mode toggle, video clips
- `/comunidad`: feed of follower reviews + author reviews, like/visto/watchlist actions, profile explorer, autoplay videos, onboarding cuestionario
- `/cinereels`: full-screen video, mute, ya la vi, watchlist, info, share, "Próximamente" badge
- `/mapa`: force-graph, search, filter by IMDB threshold, pathfinding, onboarding, minimap
- `/cast-crew`: 3 tabs (actores/directores/compositores), search, expandable rows, top 5 movies preview, Spotify embed for compositores
- `/trailers`: 3 sections (Próximamente / Trending / Catálogo), search, expandable inline player, "CLIP" badge
- `/estrenos`: filter tabs, monthly grouping, reminder toggle (localStorage), status badges
- `/musica`: search by title/composer, genre filter, expandable Spotify embed, quick-play mode
- `/cinequest`: 20+ achievements, tier badges (bronze/silver/gold), stats summary, level
- `/calculadora`: ranked platforms, match scores, top 2 banner, recommendation labels
- `/estadisticas`: stacked bars per platform, AI analysis, genre distribution, Oscar count

### Design system
- **Dark mode only** (no light mode toggle)
- **Inter font** (already Tailwind default)
- **Gold** (#facc15) as the only accent color — no amber, emerald, blue, indigo, red, purple, cyan unless representing real data (e.g., Netflix red for the Netflix logo, IMDb yellow which happens to match)
- **No emojis as icons** (♥ ✓ ★ ✕ → all to SVG)
- **Mobile-first** (start at 375px)
- **Touch targets** ≥ 44×44px

---

## 5. Success metrics

A redesigned Group A page is "done" when ALL of these are true:

1. **Zero functionality loss** — every action, data point, and interaction from the audit still works
2. **Uses shared component library** — no inline buttons, badges, cards, headers, loading states, or empty states. Everything goes through `/components/ui/`
3. **TopNav visible** at all times via the universal `<Nav>` wrapper
4. **Back button** present on detail/sub views (use the new shared `<BackButton>`)
5. **Loading + error + empty states** all defined (no blank screens)
6. **Mobile audit passes** — no horizontal overflow at 375px, all touch targets ≥ 44px
7. **Color audit passes** — no rogue amber/emerald/blue/indigo/red/purple/cyan utility classes (except for real platform branding or chart segments where multiple colors carry meaning)
8. **No emojis as icons** — all replaced with stroke SVG icons
9. **Inter font, large hero type** (text-3xl/4xl on hero), generous spacing (gap-6+, p-6+ on cards)
10. **Animations** use framer-motion for entrances and transitions where it adds polish (page enter, list stagger, hover lift)
11. **Build passes** — `npx next build` succeeds with zero new errors
12. **Diff is reviewable** — no unrelated refactors mixed in

---

## 6. Voice & tone

CineBret uses **TWO voices** in different contexts. Mixing them is a regression.

### Default: NEUTRAL Spanish (everything in the UI)

- **Tone**: Confident, clear, direct, slightly warm but never colloquial. Think Apple.cl in Spanish.
- **Use for**: page titles, buttons, modals, errors, empty states, share strings, game results, instructions, tooltips, placeholders, navigation labels — ALL UI chrome
- **Examples**: "Adivinaste la película", "No se encontraron resultados", "Películas mejor valoradas", "Volver al inicio"

### Restricted: Chilean informal (ONLY in 2 places)

1. **Author reviews** (`enriquecimiento.review_autor` field) — Alberto's personal voice
2. **Mood category names as data** — "Pa'l domingo de bajón", "Pa' saltar del sillón", "Pa' quedar con el cerebro como licuadora", "Pa' llorar a moco tendido". These are stored category labels, not copy.

### Banned phrases in UI copy

NEVER use anywhere in the product chrome (only in author reviews if quoting):

- "Cachaste" / "Cachái"
- **"Pelis"** — always write "Películas" in full
- "wn" / "weón" / "po" / "filete" / "bacán" / "fome" / "buena onda"

### Required replacements during this redesign

| ❌ Don't use | ✅ Use instead |
|---|---|
| "¡La cachaste!" | "¡Adivinaste!" or "¡Correcto!" |
| "Pelis" | "Películas" |
| Toggle "Pelis / Series" | "Películas / Series" |
| "Pa' que cachí" | "Para que sepas" |
| "Cachá esto" | "Mira esto" |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Breaking swipe logic in `/reel` during refactor | Refactor SHELL only (header, action buttons, badges). Leave the touch event handling, slide state machine, and card rendering intact. |
| Introducing performance regressions on `/mapa` | Don't touch the force-graph rendering. Only redesign the surrounding UI (search, controls, sidebar). |
| Stacked bars in `/estadisticas` losing meaning if we go gold-only | Keep multi-color for actual data segments (genres, categories) but use a constrained palette derived from the gold accent (gold, gold-light, gold-dark, plus 4 muted complementary colors). Don't go full rainbow. |
| 11 pages × scope creep = 3+ weeks of work | Strict batching: 3-4 pages per batch, user approval between batches, no scope expansion mid-batch. |
| Component library scope creep | Lock the v1 component set to: PageHeader, PageShell, Section, Card, Pill, Button, IconButton, EmptyState, LoadingState, BackButton, Tabs, SearchInput. Anything else waits for v2. |

---

## 8. Out of scope (to revisit later)

- Dark/light mode toggle
- i18n / English language
- Animations are encouraged when they elevate the design — including complex ones (scroll-driven, parallax, stagger, springs) if the polish payoff is real. Use framer-motion liberally where it adds craft, sparingly where it would feel decorative.
- New features (the rule is "preserve, polish, don't add")
- Group B games redesign (separate phase after Group A is done)
- Backend / Supabase schema changes
- Performance optimization beyond the obvious (lazy loading, image sizes)
- Accessibility audit beyond touch target sizes and basic alt text (real WCAG AA audit is a separate phase)

---

## 9. Approval

Before moving to phase 3 (Information Architecture), the user must confirm:

- [x] Scope (11 pages, removing old juntos and cambios)
- [ ] Goals (unified premium dark+gold language without losing functionality)
- [ ] Success metrics (the 12 checkboxes)
- [ ] Voice & tone (Chilean informal, confident)
- [ ] Risks acknowledged
- [ ] Out-of-scope items confirmed

Once approved, phase 3 maps the shared patterns across the 11 pages and identifies the v1 component library.
