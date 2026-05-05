// Proposal history + lifecycle (Phase 1 of agent redesign).
//
// Lifecycle states for each proposal:
//   fresh    → created in the current cycle. Shown in the email's "TOP" block.
//   backlog  → existed in a prior cycle, never accepted. Shown in the email's "Backlog" block.
//   accepted → matched against an Instagram post (after sync). Suppressed forever.
//   expired  → older than 14 days in backlog. Suppressed until cooldown elapses.
//
// State transitions happen in reconcileHistory(...) at the start of every cycle:
//   1. fresh|backlog → accepted, if title now matches a recent IG post
//   2. fresh         → backlog, in every cycle that follows the one that created it
//   3. backlog       → expired, after 14 days
//
// Cooldown for expired entries is also 14 days from their last_proposed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'

const HISTORY_VERSION = 1
const BACKLOG_MAX_DAYS = 14
const EXPIRED_COOLDOWN_DAYS = 14

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeForMatch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*review\s*[:\-—]\s*/i, '')
    .replace(/^\s*preview\s*[:\-—]\s*/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function proposalId(action, title) {
  const h = createHash('sha256').update(`${action}::${normalizeForMatch(title)}`).digest('hex')
  return h.slice(0, 16)
}

function daysBetween(aIso, bIso) {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60 * 24)
}

// ─────────────────────────────────────────────────────────────────────────────
// Load / save
// ─────────────────────────────────────────────────────────────────────────────

export function loadHistory(path) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (raw && typeof raw === 'object' && Array.isArray(raw.proposals)) return raw
  } catch {}
  return { version: HISTORY_VERSION, proposals: [] }
}

export function saveHistory(path, history) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
  history.version = HISTORY_VERSION
  history.last_saved = new Date().toISOString()
  writeFileSync(path, JSON.stringify(history, null, 2))
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation: applied at the start of every cycle, before generating new
// proposals. Inputs: current history + recent IG posts (for accepted detection)
// + nowIso. Mutates history.proposals statuses in place. Returns a stats object.
// ─────────────────────────────────────────────────────────────────────────────

export function reconcileHistory(history, recentIgPosts, nowIso) {
  const stats = { accepted: 0, becameBacklog: 0, expired: 0 }

  // Build set of normalized first lines from recent IG posts (caption headers)
  const recentTitles = []
  for (const post of (recentIgPosts || [])) {
    const firstLine = (post.caption || '').split('\n')[0].trim()
    const norm = normalizeForMatch(firstLine)
    if (norm) recentTitles.push({ norm, permalink: post.permalink, timestamp: post.timestamp })
  }

  function findIgMatch(candidateTitle) {
    const norm = normalizeForMatch(candidateTitle)
    if (!norm) return null
    return recentTitles.find(rt => rt.norm === norm || rt.norm.includes(norm) || norm.includes(rt.norm)) || null
  }

  for (const p of history.proposals) {
    if (p.status === 'accepted' || p.status === 'expired') {
      // Even expired entries can fall out of cooldown — but we don't change
      // status here; that's handled in shouldSuppress() at generation time.
      continue
    }

    // 1. fresh|backlog → accepted (title now in IG)
    const igMatch = findIgMatch(p.title)
    if (igMatch) {
      p.status = 'accepted'
      p.accepted_at = nowIso
      p.accepted_match_url = igMatch.permalink
      p.accepted_match_post_ts = igMatch.timestamp
      stats.accepted++
      continue
    }

    // 2. fresh → backlog (one cycle after creation)
    if (p.status === 'fresh' && p.last_proposed && p.last_proposed !== nowIso) {
      p.status = 'backlog'
      p.became_backlog_at = nowIso
      stats.becameBacklog++
    }

    // 3. backlog → expired (older than 14 days since first proposed)
    if (p.status === 'backlog' && daysBetween(p.first_proposed, nowIso) > BACKLOG_MAX_DAYS) {
      p.status = 'expired'
      p.expired_at = nowIso
      stats.expired++
    }
  }

  return stats
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppression check: should a candidate proposal be skipped because it's
// already known to history?
// ─────────────────────────────────────────────────────────────────────────────

export function shouldSuppress(history, candidate, nowIso) {
  const id = proposalId(candidate.action, candidate.title)
  const prior = history.proposals.find(p => p.id === id)
  if (!prior) return { suppress: false }

  if (prior.status === 'accepted') {
    return { suppress: true, reason: 'already accepted (posted to IG)', prior }
  }
  if (prior.status === 'fresh' || prior.status === 'backlog') {
    return { suppress: true, reason: `already ${prior.status} in history`, prior }
  }
  if (prior.status === 'expired') {
    const daysSince = daysBetween(prior.last_proposed, nowIso)
    if (daysSince < EXPIRED_COOLDOWN_DAYS) {
      return { suppress: true, reason: `expired ${Math.round(daysSince)}d ago, cooldown ${EXPIRED_COOLDOWN_DAYS}d`, prior }
    }
    return { suppress: false, reason: 'expired but past cooldown', prior }
  }
  return { suppress: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add a proposal to history (or refresh its last_proposed timestamp).
// ─────────────────────────────────────────────────────────────────────────────

export function recordProposal(history, proposal, nowIso) {
  const id = proposalId(proposal.action, proposal.title)
  const existing = history.proposals.find(p => p.id === id)
  if (existing) {
    existing.last_proposed = nowIso
    existing.cycles_proposed = (existing.cycles_proposed || 0) + 1
    // If we're re-recording an expired-but-past-cooldown entry, reset to fresh
    if (existing.status === 'expired') {
      existing.status = 'fresh'
      existing.first_proposed = nowIso
      existing.cycles_proposed = 1
    }
    return existing
  }
  const entry = {
    id,
    action:           proposal.action,
    title:            proposal.title,
    type:             proposal.type,
    priority:         proposal.priority,
    score:            proposal.score,
    reasoning:        proposal.reasoning,
    suggested_caption: proposal.suggested_caption || null,
    source_name:      proposal.source_name || null,
    source_url:       proposal.source_url || null,
    skill_to_invoke:  proposal.skill_to_invoke || null,
    skill_args:       proposal.skill_args || null,
    first_proposed:   nowIso,
    last_proposed:    nowIso,
    cycles_proposed:  1,
    status:           'fresh',
    accepted_at:      null,
    accepted_match_url: null,
  }
  history.proposals.push(entry)
  return entry
}

// ─────────────────────────────────────────────────────────────────────────────
// Backlog query: proposals currently in 'backlog' status, sorted by score desc.
// ─────────────────────────────────────────────────────────────────────────────

export function getBacklog(history, max = 10) {
  return history.proposals
    .filter(p => p.status === 'backlog')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, max)
}

// Garbage collection: drop accepted/expired entries older than ~60 days to
// keep the file from growing unbounded.
export function gcHistory(history, nowIso, retentionDays = 60) {
  const cutoff = new Date(nowIso).getTime() - retentionDays * 86400 * 1000
  const before = history.proposals.length
  history.proposals = history.proposals.filter(p => {
    if (p.status === 'fresh' || p.status === 'backlog') return true
    const ts = new Date(p.last_proposed || p.first_proposed).getTime()
    return ts >= cutoff
  })
  return before - history.proposals.length
}
