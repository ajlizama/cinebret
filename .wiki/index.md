---
description: Master index of the CineBret project wiki. The LLM reads this first to find relevant pages.
updated: 2026-05-04
---

# CineBret Wiki — Index

> This wiki is maintained by the LLM (Claude). Alberto curates sources, asks questions, and directs the work. The LLM does all the writing, cross-referencing, and maintenance.

## Architecture (READ FIRST)
The big picture. Always read these before doing anything that touches repos, workflows, Supabase or Vercel.

- [[architecture-overview]] — **READ FIRST.** Naming discipline, repo map, folder map, Supabase, Vercel, daily clock
- [[github-workflows]] — `daily.yml` vs `cinebret-agent.yml` side-by-side comparison

## Entities
Core concepts, systems, and components of CineBret.

- [[design-system]] — v1 component library: 24 components, tokens, motion, icons
- [[supabase-schema]] — Tables, RLS policies, RPCs, data model
- [[nav-system]] — TopNav, PageShell, routing, menu structure
- [[smart-search]] — Multi-field token-AND search + AI-powered smart search
- [[game-stats-system]] — Shared stats persistence (localStorage + Supabase) for competitive games
- [[svg-to-png]] — Shared lib for generating Instagram-style downloadable PNGs
- [[movie-graph]] — Force-directed graph: nodes, edges, similar_ids, weight formula
- [[embedded-tinder]] — Tinder-style swipe widget embedded in landing + standalone /reel

## Patterns
Reusable UX/engineering patterns applied across multiple pages.

- [[pattern-competitive-game]] — Wordle-style: instructions modal, auth-aware stats, login CTA
- [[pattern-user-creations]] — Save/publish/delete/PNG share for user-generated content
- [[pattern-shell-refactor]] — The approach used across 27 pages: shell-only, preserve logic

## Decisions
Architecture Decision Records — why we chose what we chose.

- [[adr-001-gold-only-palette]] — Single accent color discipline
- [[adr-002-neutral-spanish]] — Voice & tone rules
- [[adr-003-no-emojis-as-icons]] — SVG Icon namespace
- [[adr-004-paginate-supabase]] — Always paginate, 1000-row default
- [[adr-005-performance-exception]] — When logic changes are allowed in a design refactor
- [[adr-006-mobile-first]] — 375px, 44px touch targets, 16px inputs

## User
Alberto's preferences, working style, and feedback patterns.

- [[user-design-preferences]] — Premium dark+gold, Inter, bold, Instagram-worthy
- [[user-voice-rules]] — Neutral Spanish everywhere, Chilean only in author reviews
- [[user-workflow-rules]] — No dev servers, deploy when asked, never postpone, read before copy

## Project
Current state, roadmap, and ongoing work.

- [[project-overhaul-status]] — Groups A/B/C/D status tracker
- [[project-pending-work]] — Batalla bracket polish, future improvements
- [[project-data-pipeline]] — Movie enrichment, TMDB, series, graph generation

## Reviews / Agent
The Instagram content agent. AGENT-RULES is the source of truth — edit there to change behavior.

- [[reviews/AGENT-RULES]] — **THE filter/decision rules the critic enforces every cycle**
- [[reviews/AGENT-STRATEGY]] — Why we publish what we publish (mix 3-1-2, voices, cadence)
- [[reviews/AGENT-OPERATIONS]] — How the agent runs (scripts, secrets, schedule)
- [[reviews/review-brain]] — 7-node decision tree for writing reviews as Alberto
- [[reviews/taste-profile]] — 38 rating-10 movies, directors (Olimpo / respected / admired), genres
- [[reviews/brand-config]] — Voice (3 voices), vocabulary, hashtags, anti-patterns
- [[reviews/instagram-format]] — IG caption template
- [[reviews/index]] — Master index for the review agent wiki

## Log
- [[log]] — Chronological record of sessions, deploys, decisions
- [[reviews/review-log]] — Chronological record of reviews written by the agent
