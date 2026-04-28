// CineBret Alert Email — sends digest with TOP 3 actionable proposals + raw signals as FYI
// Uses output of cinebret-propose.mjs
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
if (!proposals || !proposals.top || proposals.top.length === 0) {
  console.log('⚠️  No proposals to send. Run cinebret-propose.mjs first.')
  process.exit(0)
}

// QUALITY GATE: only send if proposals pass quality threshold
if (!proposals.passes_quality_gate && !FORCE) {
  console.log('⚠️  Proposals do not pass quality gate. Skipping email.')
  console.log('   Use --force to send anyway.')
  process.exit(0)
}

console.log(`📨 CineBret Alert Email — building digest from ${proposals.total} proposals\n`)

// Dedup against history
const history = readJsonOrEmpty(ALERT_DEDUP_FILE) || { sent_keys: [] }
const today = new Date().toISOString().slice(0, 10)
const newKey = `digest:${today}:${proposals.top.map(p => p.action).join(',')}`
const alreadySent = history.sent_keys.includes(newKey)

if (alreadySent && !FORCE) {
  console.log('✅ Already sent this digest today. Use --force to send again.')
  process.exit(0)
}

// ─── BUILD HTML ───

const typeBadge = (type) => type === 'STORY'
  ? '<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.05em;padding:3px 9px;border-radius:3px;">HISTORIA</span>'
  : '<span style="background:#fbbf24;color:#0a0a0a;font-size:10px;font-weight:700;letter-spacing:0.05em;padding:3px 9px;border-radius:3px;">FEED</span>'

const priorityColor = (p) => p === 'alta' ? '#fbbf24' : (p === 'media' ? '#a78bfa' : '#6b7280')

const buildProposalCard = (p, idx) => `
<div style="background:#1c1c1f;border:1px solid #2a2a2e;border-left:4px solid ${priorityColor(p.priority)};border-radius:6px;padding:18px 22px;margin-bottom:16px;color:#f5f5f5;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
    <span style="background:#27272a;color:#fbbf24;font-weight:700;font-size:13px;padding:2px 8px;border-radius:3px;">${idx + 1}</span>
    ${typeBadge(p.type)}
    <span style="color:${priorityColor(p.priority)};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">prioridad ${p.priority}</span>
  </div>
  <div style="color:#ffffff;font-weight:600;font-size:17px;line-height:1.3;margin-bottom:8px;">${p.title}</div>
  <div style="color:#d4d4d8;font-size:13px;line-height:1.5;margin-bottom:12px;"><strong style="color:#fbbf24;">Por qué ahora:</strong> ${p.reasoning}</div>
  ${p.suggested_caption ? `
  <div style="background:#0a0a0a;border:1px dashed #3f3f46;border-radius:4px;padding:12px;margin-bottom:12px;">
    <div style="color:#a1a1aa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Caption sugerido</div>
    <div style="color:#e4e4e7;font-size:13px;line-height:1.5;white-space:pre-wrap;">${p.suggested_caption}</div>
  </div>
  ` : ''}
  ${p.source_url ? `<div><a href="${p.source_url}" style="color:#60a5fa;font-size:12px;text-decoration:none;">Ver fuente original →</a></div>` : ''}
  <div style="color:#71717a;font-size:11px;margin-top:10px;">
    💡 Para ejecutar en Claude Code: <code style="background:#27272a;color:#fbbf24;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:11px;">${p.skill_to_invoke || 'cinebret-strategist'}</code>
  </div>
</div>
`

const buildFyiItem = (p) => `
<div style="border-left:2px solid #3f3f46;padding:8px 14px;margin-bottom:8px;color:#d4d4d8;">
  <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${p.type === 'STORY' ? 'historia' : 'feed'} · ${p.action.replace(/_/g, ' ')}</div>
  <div style="color:#f5f5f5;font-size:14px;font-weight:500;margin:2px 0;">${p.title}</div>
  <div style="color:#a1a1aa;font-size:12px;">${p.reasoning}</div>
</div>
`

const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CineBret — Propuestas del día</title>
</head><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f5f5f5;">
<div style="max-width:640px;margin:0 auto;padding:32px 24px;">

<div style="margin-bottom:32px;">
  <div style="color:#fbbf24;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px;">🎬 CineBret Agent</div>
  <div style="color:#a1a1aa;font-size:14px;">Propuestas del día · ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' })}</div>
</div>

<div style="background:linear-gradient(135deg,#1f1f23 0%,#0a0a0a 100%);border:1px solid #fbbf24;border-radius:8px;padding:18px 22px;margin-bottom:28px;color:#fbbf24;">
  <div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">⭐ Top ${proposals.top.length} para hoy</div>
  <div style="color:#d4d4d8;font-size:13px;">Acciones concretas con caption sugerido. Elige una y dile al agente.</div>
</div>

<h2 style="color:#fbbf24;font-size:18px;font-weight:600;margin:0 0 16px;">Propuestas accionables</h2>

${proposals.top.map(buildProposalCard).join('')}

${proposals.rest.length > 0 ? `
<h2 style="color:#a1a1aa;font-size:14px;font-weight:600;margin:32px 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Otras señales (FYI)</h2>
<div style="background:#0f0f12;border:1px solid #27272a;border-radius:6px;padding:12px;">
${proposals.rest.map(buildFyiItem).join('')}
</div>
` : ''}

<div style="margin-top:40px;padding-top:20px;border-top:1px solid #27272a;color:#71717a;font-size:11px;line-height:1.6;">
  <div style="margin-bottom:6px;">Total señales analizadas: ${(proposals.raw_signal_counts?.news_items || 0) + (proposals.raw_signal_counts?.reddit_posts || 0) + (proposals.raw_signal_counts?.trailers || 0)} (news ${proposals.raw_signal_counts?.news_items || 0} · reddit ${proposals.raw_signal_counts?.reddit_posts || 0} · trailers ${proposals.raw_signal_counts?.trailers || 0})</div>
  <div style="margin-bottom:6px;">Reviews pendientes alta prioridad: ${proposals.raw_signal_counts?.pending_reviews || 0}</div>
  <div style="margin-bottom:12px;">Cron: cada 2h via GitHub Actions</div>
  <div>Para ver más detalle o ejecutar una propuesta:<br>
  <code style="background:#1c1c1f;color:#fbbf24;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:11px;">cd cinebret && claude → "qué publicamos hoy"</code></div>
</div>

</div></body></html>`

// ─── PREVIEW / SEND ───

const subject = `🎬 CineBret — ${proposals.top.length} propuestas para hoy (${proposals.top.filter(p => p.type === 'STORY').length} historia, ${proposals.top.filter(p => p.type === 'FEED').length} feed)`

if (DRY_RUN || !RESEND_KEY) {
  console.log('--- EMAIL PREVIEW ---')
  console.log(`To: ${TO_EMAIL}`)
  console.log(`From: ${FROM_EMAIL}`)
  console.log(`Subject: ${subject}`)
  console.log()
  console.log(`TOP ${proposals.top.length}:`)
  for (let i = 0; i < proposals.top.length; i++) {
    const p = proposals.top[i]
    console.log(`\n  ${i + 1}. [${p.type}] ${p.title}`)
    console.log(`     Por qué: ${p.reasoning}`)
    if (p.suggested_caption) console.log(`     Caption: ${p.suggested_caption.replace(/\n/g, ' / ').slice(0, 80)}...`)
    console.log(`     Skill: ${p.skill_to_invoke}`)
  }
  console.log(`\nFYI (${proposals.rest.length}):`)
  for (const p of proposals.rest) {
    console.log(`  - [${p.type}] ${p.title} — ${p.reasoning.slice(0, 80)}`)
  }
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
