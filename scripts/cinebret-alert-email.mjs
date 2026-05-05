// CineBret Alert Email — sends a digest with three blocks:
//   1. 🔥 Top 5 reactivas (proposals fresh this cycle)
//   2. 📰 Lo que pasó en cine (news, informational)
//   3. 📋 Backlog (proposals from past cycles still pending)
//
// Uses output of cinebret-propose.mjs.
// Usage: node scripts/cinebret-alert-email.mjs [--force] [--dry-run]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const RESEND_KEY = process.env.RESEND_API_KEY
const TO_EMAIL = process.env.CINEBRET_ALERT_EMAIL || 'ajlizamca@gmail.com'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'CineBret Agent <agent@cinebret.cl>'
const FORCE = process.argv.includes('--force')
const DRY_RUN = process.argv.includes('--dry-run')
const ALERT_DEDUP_FILE = join(ROOT, '.wiki/sources/alert-history.json')

function readJsonOrEmpty(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

const proposals = readJsonOrEmpty(join(ROOT, '.wiki/sources/proposals-latest.json'))
if (!proposals) {
  console.log('⚠️  No proposals file. Run cinebret-propose.mjs first.')
  process.exit(0)
}

const top = proposals.top || []
const backlog = proposals.backlog || []
const news = proposals.news || []

if (!proposals.passes_quality_gate && !FORCE) {
  console.log('⚠️  Proposals do not pass quality gate. Skipping email.')
  console.log(`   top=${top.length}  backlog=${backlog.length}  news=${news.length}`)
  console.log('   Use --force to send anyway.')
  process.exit(0)
}

console.log(`📨 Building digest: ${top.length} reactive · ${backlog.length} backlog · ${news.length} news\n`)

// ─── Dedup against history (avoid sending same digest twice in a day) ──────
const history = readJsonOrEmpty(ALERT_DEDUP_FILE) || { sent_keys: [] }
const today = new Date().toISOString().slice(0, 10)
const newKey = `digest:${today}:${proposals.cycle}:${top.map(p => p.action + ':' + p.title.slice(0, 30)).join('|')}`
if (history.sent_keys?.includes(newKey) && !FORCE) {
  console.log('✅ Already sent this exact digest. Use --force to send again.')
  process.exit(0)
}

// ─── HTML helpers ──────────────────────────────────────────────────────────

const typeBadge = (type) => type === 'STORY'
  ? '<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.05em;padding:3px 9px;border-radius:3px;">HISTORIA</span>'
  : '<span style="background:#fbbf24;color:#0a0a0a;font-size:10px;font-weight:700;letter-spacing:0.05em;padding:3px 9px;border-radius:3px;">FEED</span>'

const priorityColor = (p) => p === 'alta' ? '#fbbf24' : (p === 'media' ? '#a78bfa' : '#6b7280')

const proposalCard = (p, idx, accent = '#fbbf24') => `
<div style="background:#1c1c1f;border:1px solid #2a2a2e;border-left:4px solid ${accent};border-radius:6px;padding:18px 22px;margin-bottom:16px;color:#f5f5f5;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
    <span style="background:#27272a;color:${accent};font-weight:700;font-size:13px;padding:2px 8px;border-radius:3px;">${idx + 1}</span>
    ${typeBadge(p.type)}
    <span style="color:${priorityColor(p.priority)};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">prioridad ${p.priority}</span>
  </div>
  <div style="color:#ffffff;font-weight:600;font-size:17px;line-height:1.3;margin-bottom:8px;">${escapeHtml(p.title)}</div>
  <div style="color:#d4d4d8;font-size:13px;line-height:1.5;margin-bottom:12px;"><strong style="color:${accent};">Por qué ahora:</strong> ${escapeHtml(p.reasoning || '')}</div>
  ${p.suggested_caption ? `
  <div style="background:#0a0a0a;border:1px dashed #3f3f46;border-radius:4px;padding:12px;margin-bottom:12px;">
    <div style="color:#a1a1aa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Caption sugerido</div>
    <div style="color:#e4e4e7;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(p.suggested_caption)}</div>
  </div>` : ''}
  ${p.source_url ? `<div><a href="${p.source_url}" style="color:#60a5fa;font-size:12px;text-decoration:none;">Ver fuente original →</a></div>` : ''}
  ${p.skill_to_invoke ? `<div style="color:#71717a;font-size:11px;margin-top:10px;">💡 Para ejecutar en Claude Code: <code style="background:#27272a;color:${accent};padding:2px 6px;border-radius:3px;font-family:monospace;font-size:11px;">${p.skill_to_invoke}</code></div>` : ''}
</div>`

const newsItem = (n) => {
  const ageH = n.published_iso ? Math.round((Date.now() - new Date(n.published_iso).getTime()) / 36e5) : null
  const meta = []
  if (n._catalog) meta.push(`<span style="color:#fbbf24;">📚 ${escapeHtml(n._catalog.titulo)}</span>`)
  if (n._director) meta.push(`<span style="color:#a78bfa;">🎬 ${escapeHtml(n._director)}</span>`)
  return `
<div style="border-left:2px solid #3f3f46;padding:10px 14px;margin-bottom:8px;">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:4px;">
    <span style="color:#a1a1aa;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${escapeHtml(n.source || '?')}</span>
    ${ageH !== null ? `<span style="color:#71717a;font-size:11px;">${ageH}h</span>` : ''}
  </div>
  <a href="${n.link || '#'}" style="color:#f5f5f5;font-size:13px;font-weight:500;line-height:1.4;text-decoration:none;display:block;margin-bottom:4px;">${escapeHtml(n.title || '')}</a>
  ${meta.length > 0 ? `<div style="font-size:11px;display:flex;gap:10px;">${meta.join('')}</div>` : ''}
</div>`
}

const backlogItem = (p) => {
  const daysAgo = p.first_proposed ? Math.round((Date.now() - new Date(p.first_proposed).getTime()) / 86400000) : 0
  return `
<div style="background:#15151a;border:1px solid #2a2a2e;border-radius:6px;padding:12px 16px;margin-bottom:10px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    ${typeBadge(p.type)}
    <span style="color:#71717a;font-size:11px;">propuesta hace ${daysAgo}d · pendiente</span>
  </div>
  <div style="color:#e4e4e7;font-size:14px;font-weight:500;margin-bottom:4px;">${escapeHtml(p.title)}</div>
  <div style="color:#a1a1aa;font-size:12px;line-height:1.4;">${escapeHtml(p.reasoning || '')}</div>
  ${p.skill_to_invoke ? `<div style="color:#52525b;font-size:11px;margin-top:8px;"><code style="background:#27272a;color:#a78bfa;padding:2px 6px;border-radius:3px;font-family:monospace;">${p.skill_to_invoke}</code></div>` : ''}
</div>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// ─── Subject line (reflects actual content) ────────────────────────────────

const cycleLabel = proposals.cycle === 'pm' ? 'tarde' : 'mañana'
const reactiveCount = top.length
const newsCount = news.length
const backlogCount = backlog.length
const subject = reactiveCount > 0
  ? `🎬 CineBret · ${cycleLabel}: ${reactiveCount} reactiva${reactiveCount === 1 ? '' : 's'}${backlogCount > 0 ? ` + ${backlogCount} backlog` : ''}${newsCount > 0 ? ` + ${newsCount} noticias` : ''}`
  : `🎬 CineBret · ${cycleLabel}: sin reactivas hoy${backlogCount > 0 ? ` (${backlogCount} backlog pendiente)` : ''}`

// ─── Build HTML ─────────────────────────────────────────────────────────────

const dateLong = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' })

const reactiveBlock = top.length > 0 ? `
<h2 style="color:#fbbf24;font-size:18px;font-weight:600;margin:0 0 16px;">🔥 ${top.length} propuesta${top.length === 1 ? '' : 's'} reactiva${top.length === 1 ? '' : 's'}</h2>
<div style="color:#a1a1aa;font-size:12px;margin-bottom:14px;">Lo más actionable de este ciclo. Si no las tomas, mañana van al backlog.</div>
${top.map((p, i) => proposalCard(p, i, '#fbbf24')).join('')}
` : `
<div style="background:#15151a;border:1px solid #2a2a2e;border-radius:6px;padding:18px;margin-bottom:24px;color:#a1a1aa;font-size:13px;">
  Hoy no surgieron propuestas reactivas nuevas (todas las señales coinciden con backlog actual).
</div>`

const newsBlock = news.length > 0 ? `
<h2 style="color:#a78bfa;font-size:16px;font-weight:600;margin:32px 0 12px;">📰 Lo que pasó en cine</h2>
<div style="color:#a1a1aa;font-size:12px;margin-bottom:14px;">Noticias relevantes de las últimas 30h (informativo — tú decides qué hacer con ellas).</div>
<div style="background:#0f0f12;border:1px solid #27272a;border-radius:6px;padding:12px;">
${news.map(newsItem).join('')}
</div>` : ''

const backlogBlock = backlog.length > 0 ? `
<h2 style="color:#71717a;font-size:16px;font-weight:600;margin:32px 0 12px;">📋 Backlog · ${backlog.length} pendiente${backlog.length === 1 ? '' : 's'}</h2>
<div style="color:#a1a1aa;font-size:12px;margin-bottom:14px;">Propuestas de ciclos pasados que aún no tomaste. Quedan vigentes hasta 14 días.</div>
${backlog.map(backlogItem).join('')}` : ''

const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CineBret — Propuestas del día</title>
</head><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f5f5f5;">
<div style="max-width:640px;margin:0 auto;padding:32px 24px;">

<div style="margin-bottom:32px;">
  <div style="color:#fbbf24;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px;">🎬 CineBret Agent</div>
  <div style="color:#a1a1aa;font-size:14px;">${dateLong} · ciclo ${proposals.cycle?.toUpperCase() || ''}</div>
</div>

${reactiveBlock}

${newsBlock}

${backlogBlock}

<div style="margin-top:40px;padding-top:20px;border-top:1px solid #27272a;color:#71717a;font-size:11px;line-height:1.6;">
  <div style="margin-bottom:6px;">Señales analizadas: news ${proposals.raw_signal_counts?.news_items || 0} · newsapi ${proposals.raw_signal_counts?.newsapi_items || 0} · reddit ${proposals.raw_signal_counts?.reddit_posts || 0} · trailers ${proposals.raw_signal_counts?.trailers || 0}</div>
  ${proposals.reconciliation_stats ? `<div style="margin-bottom:6px;">Historial: ${proposals.reconciliation_stats.accepted} aceptadas · ${proposals.reconciliation_stats.becameBacklog} pasaron a backlog · ${proposals.reconciliation_stats.expired} expiradas</div>` : ''}
  <div style="margin-bottom:6px;">Cron: 8 AM + 5 PM Chile · GitHub Actions</div>
  <div>Para ejecutar una propuesta: <code style="background:#1c1c1f;color:#fbbf24;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:11px;">cd cinebret && claude → "qué publicamos hoy"</code></div>
</div>

</div></body></html>`

// ─── Send / dry-run ────────────────────────────────────────────────────────

if (DRY_RUN || !RESEND_KEY) {
  console.log('--- EMAIL PREVIEW ---')
  console.log(`To: ${TO_EMAIL}`)
  console.log(`Subject: ${subject}`)
  console.log(`\nReactive (${top.length}):`)
  top.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.type}] ${p.title}`)
    console.log(`     ${p.reasoning}`)
  })
  console.log(`\nNews (${news.length}):`)
  news.slice(0, 5).forEach(n => console.log(`  - ${n.source}: ${n.title?.slice(0, 80)}`))
  console.log(`\nBacklog (${backlog.length}):`)
  backlog.forEach(b => console.log(`  - [${b.type}] ${b.title}`))
  console.log('\n(dry-run, not sending)')
  process.exit(0)
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: FROM_EMAIL, to: TO_EMAIL, subject, html }),
})

if (!res.ok) {
  console.error(`❌ Send failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const result = await res.json()
console.log(`✅ Email sent. ID: ${result.id}`)

history.sent_keys = [...new Set([...(history.sent_keys || []), newKey])].slice(-100)
history.last_sent = new Date().toISOString()
if (!existsSync(dirname(ALERT_DEDUP_FILE))) mkdirSync(dirname(ALERT_DEDUP_FILE), { recursive: true })
writeFileSync(ALERT_DEDUP_FILE, JSON.stringify(history, null, 2))
