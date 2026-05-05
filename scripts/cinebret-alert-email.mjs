// CineBret Alert Email — sends a digest with three blocks:
//   1. Propuestas (5 reactivas this cycle)
//   2. Noticias (informational, strictly filtered)
//   3. Backlog (history items still pending)
//
// Visual design grounded in CineBret design system:
//   - dark + single gold accent (#facc15)
//   - Inter font stack
//   - rounded-xl cards, generous spacing
//   - no emoji as icons (decorative only, sparingly)
//   - HTML entities decoded for legibility

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
if (!proposals) { console.log('⚠️  No proposals file.'); process.exit(0) }

const top = proposals.top || []
const backlog = proposals.backlog || []
const news = proposals.news || []

if (!proposals.passes_quality_gate && !FORCE) {
  console.log(`⚠️  Quality gate fail. top=${top.length} backlog=${backlog.length} news=${news.length}. Use --force to send.`)
  process.exit(0)
}

console.log(`Building digest: ${top.length} reactivas · ${backlog.length} backlog · ${news.length} noticias\n`)

// Dedup against history
const history = readJsonOrEmpty(ALERT_DEDUP_FILE) || { sent_keys: [] }
const today = new Date().toISOString().slice(0, 10)
const newKey = `${today}:${proposals.cycle}:${top.map(p => p.action + ':' + p.title.slice(0, 30)).join('|')}`
if (history.sent_keys?.includes(newKey) && !FORCE) {
  console.log('Already sent this exact digest. Use --force to send again.'); process.exit(0)
}

// ─── Decode HTML entities (numeric + named) so feed titles read clean ────────

function decodeHtmlEntities(s) {
  if (!s) return ''
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function clean(s) { return escapeHtml(decodeHtmlEntities(s)) }

// ─── Design tokens (mirror lib/design/tokens.ts where applicable) ───────────

const COLOR = {
  bg:        '#0A0A0A',
  surface:   '#15151A',
  surface2:  '#1C1C22',
  border:    '#27272A',
  borderHi:  '#3F3F46',
  text:      '#FAFAFA',
  textMuted: '#A1A1AA',
  textDim:   '#71717A',
  gold:      '#facc15',     // matches user-design-preferences.md (#facc15 / yellow-400)
  goldDark:  '#a16207',
  goldSoft:  'rgba(250, 204, 21, 0.08)',
}

const FONT = `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`

// ─── Card builders ───────────────────────────────────────────────────────────

function typeLabel(type) {
  return type === 'STORY'
    ? `<span style="display:inline-block;font-size:10px;font-weight:600;letter-spacing:.08em;padding:3px 9px;border-radius:4px;background:${COLOR.surface2};color:#c4b5fd;border:1px solid #4c1d95;">HISTORIA</span>`
    : `<span style="display:inline-block;font-size:10px;font-weight:600;letter-spacing:.08em;padding:3px 9px;border-radius:4px;background:${COLOR.goldSoft};color:${COLOR.gold};border:1px solid ${COLOR.goldDark};">FEED</span>`
}

function actionLabel(action) {
  const map = {
    generate_review: 'Review',
    generate_carousel_topic: 'Carrusel temático',
    generate_carousel_mood: 'Lista por mood',
    generate_carousel_awards: 'Cobertura premios',
    share_trailer_in_story: 'Compartir trailer',
    react_to_news: 'Carrusel desde noticia',
  }
  return map[action] || action
}

function proposalCard(p, idx) {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:14px;">
  <tr><td style="background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:12px;padding:20px 22px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:11px;font-weight:700;color:${COLOR.gold};letter-spacing:.1em;">PROPUESTA ${idx + 1}</span>
      <span style="color:${COLOR.borderHi};">·</span>
      ${typeLabel(p.type)}
      <span style="font-size:11px;color:${COLOR.textMuted};">${actionLabel(p.action)}</span>
    </div>
    <div style="color:${COLOR.text};font-weight:600;font-size:18px;line-height:1.3;letter-spacing:-0.01em;margin-bottom:8px;">${clean(p.title)}</div>
    <div style="color:${COLOR.textMuted};font-size:13px;line-height:1.55;margin-bottom:12px;">${clean(p.reasoning)}</div>
    ${p.source_url ? `<div style="margin-bottom:8px;"><a href="${p.source_url}" style="color:${COLOR.gold};font-size:12px;text-decoration:none;font-weight:500;">Ver fuente →</a></div>` : ''}
    ${p.skill_to_invoke ? `<div style="font-size:11px;color:${COLOR.textDim};font-family:'SF Mono',Monaco,Menlo,monospace;background:${COLOR.surface2};display:inline-block;padding:4px 8px;border-radius:4px;border:1px solid ${COLOR.border};">${p.skill_to_invoke}</div>` : ''}
  </td></tr>
</table>`
}

function newsItem(n) {
  const ageH = n.published_iso ? Math.round((Date.now() - new Date(n.published_iso).getTime()) / 36e5) : null
  const tags = []
  if (n._catalog) tags.push(`<span style="display:inline-block;font-size:11px;color:${COLOR.gold};margin-right:8px;">en tu catálogo · ${clean(n._catalog.titulo)}</span>`)
  if (n._director) tags.push(`<span style="display:inline-block;font-size:11px;color:#c4b5fd;">director · ${clean(n._director)}</span>`)
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr><td style="padding:14px 16px;border-bottom:1px solid ${COLOR.border};">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:${COLOR.textDim};margin-bottom:6px;letter-spacing:.05em;text-transform:uppercase;">
      <span>${clean(n.source || '')}</span>
      ${ageH !== null ? `<span>${ageH}h</span>` : ''}
    </div>
    <a href="${n.link || '#'}" style="display:block;color:${COLOR.text};font-size:14px;font-weight:500;line-height:1.4;text-decoration:none;margin-bottom:6px;">${clean(n.title)}</a>
    ${tags.length > 0 ? `<div>${tags.join('')}</div>` : ''}
  </td></tr>
</table>`
}

function backlogCard(p) {
  const daysAgo = p.first_proposed ? Math.round((Date.now() - new Date(p.first_proposed).getTime()) / 86400000) : 0
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:10px;">
  <tr><td style="background:${COLOR.bg};border:1px solid ${COLOR.border};border-radius:10px;padding:14px 18px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      ${typeLabel(p.type)}
      <span style="font-size:11px;color:${COLOR.textDim};">propuesta hace ${daysAgo}d</span>
    </div>
    <div style="color:${COLOR.text};font-size:14px;font-weight:500;line-height:1.4;margin-bottom:4px;">${clean(p.title)}</div>
    <div style="color:${COLOR.textMuted};font-size:12px;line-height:1.45;">${clean(p.reasoning || '')}</div>
  </td></tr>
</table>`
}

function sectionHeading(label, sub) {
  return `
<div style="margin:36px 0 14px;">
  <div style="font-size:11px;font-weight:700;color:${COLOR.gold};letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">${label}</div>
  ${sub ? `<div style="color:${COLOR.textMuted};font-size:13px;line-height:1.5;">${sub}</div>` : ''}
</div>`
}

// ─── Subject ─────────────────────────────────────────────────────────────────

const cycleLabel = proposals.cycle === 'pm' ? 'tarde' : 'mañana'
const reviewCount = top.filter(p => p.action === 'generate_review').length
const subjectParts = []
if (reviewCount > 0) subjectParts.push(`${reviewCount} review${reviewCount === 1 ? '' : 's'}`)
const carCount = top.filter(p => p.action === 'generate_carousel_topic' || p.action === 'generate_carousel_mood').length
if (carCount > 0) subjectParts.push(`${carCount} lista`)
const reactiveCount = top.filter(p => p.action === 'share_trailer_in_story' || p.action === 'react_to_news' || p.action === 'generate_carousel_awards').length
if (reactiveCount > 0) subjectParts.push(`${reactiveCount} reactiva`)
if (backlog.length > 0) subjectParts.push(`${backlog.length} backlog`)
const subject = `CineBret · ${cycleLabel} · ${subjectParts.join(' · ') || 'sin propuestas'}`

// ─── HTML body ───────────────────────────────────────────────────────────────

const dateLong = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' })

const reactivaSection = top.length > 0 ? `
${sectionHeading(`${top.length} propuesta${top.length === 1 ? '' : 's'}`, 'Mix editorial: reviews + lista + reactiva. Si no las tomas, mañana van al backlog.')}
${top.map((p, i) => proposalCard(p, i)).join('')}
` : `
${sectionHeading('Sin propuestas reactivas hoy', 'Las señales de hoy no superaron el filtro de calidad. Revisa el backlog si quedan pendientes.')}`

const newsSection = news.length > 0 ? `
${sectionHeading(`${news.length} noticias filtradas`, 'Solo noticias con match en tu catálogo (rating ≥7) o director del olimpo. Tú decides qué hacer con ellas.')}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr><td style="background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:12px;padding:0;">
    ${news.map(newsItem).join('')}
  </td></tr>
</table>` : ''

const backlogSection = backlog.length > 0 ? `
${sectionHeading(`${backlog.length} en backlog`, 'Propuestas de ciclos pasados que aún no tomaste. Vigentes hasta 14 días.')}
${backlog.map(backlogCard).join('')}` : ''

const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CineBret · ${cycleLabel}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:${FONT};color:${COLOR.text};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLOR.bg};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">

<tr><td style="padding:0 8px;">

<div style="margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid ${COLOR.border};">
  <div style="color:${COLOR.gold};font-size:28px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;">CineBret</div>
  <div style="color:${COLOR.textMuted};font-size:13px;">${dateLong} · ciclo ${(proposals.cycle || '').toUpperCase()}</div>
</div>

${reactivaSection}
${newsSection}
${backlogSection}

<div style="margin-top:48px;padding-top:24px;border-top:1px solid ${COLOR.border};color:${COLOR.textDim};font-size:11px;line-height:1.7;">
  <div>Señales: ${proposals.raw_signal_counts?.news_items || 0} news · ${proposals.raw_signal_counts?.newsapi_items || 0} newsapi · ${proposals.raw_signal_counts?.reddit_posts || 0} reddit · ${proposals.raw_signal_counts?.trailers || 0} trailers</div>
  ${proposals.reconciliation_stats ? `<div>Historial: ${proposals.reconciliation_stats.accepted} aceptadas · ${proposals.reconciliation_stats.becameBacklog} → backlog · ${proposals.reconciliation_stats.expired} expiradas</div>` : ''}
  <div>Cron: 8 AM + 5 PM Chile · GitHub Actions · cinebret-agent.yml</div>
  <div style="margin-top:10px;">Para ejecutar una propuesta: <span style="font-family:'SF Mono',Monaco,Menlo,monospace;background:${COLOR.surface};color:${COLOR.gold};padding:2px 8px;border-radius:4px;">claude → "qué publicamos hoy"</span></div>
</div>

</td></tr></table>
</td></tr></table>
</body></html>`

// ─── Send / dry-run ─────────────────────────────────────────────────────────

if (DRY_RUN || !RESEND_KEY) {
  console.log('--- EMAIL PREVIEW ---')
  console.log(`To: ${TO_EMAIL}`)
  console.log(`Subject: ${subject}`)
  console.log(`\nReactive (${top.length}):`)
  top.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.type}] ${decodeHtmlEntities(p.title)}`)
    console.log(`     ${decodeHtmlEntities(p.reasoning)}`)
  })
  console.log(`\nNews (${news.length}):`)
  news.forEach(n => console.log(`  - ${n.source}: ${decodeHtmlEntities(n.title).slice(0, 80)}`))
  console.log(`\nBacklog (${backlog.length}):`)
  backlog.forEach(b => console.log(`  - [${b.type}] ${decodeHtmlEntities(b.title)}`))

  // Save HTML to a file for visual inspection
  const previewFile = join(ROOT, '.wiki/sources/email-preview.html')
  writeFileSync(previewFile, html)
  console.log(`\nHTML preview → ${previewFile}`)
  process.exit(0)
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: FROM_EMAIL, to: TO_EMAIL, subject, html }),
})
if (!res.ok) {
  console.error(`Send failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const result = await res.json()
console.log(`Email sent. ID: ${result.id}`)

history.sent_keys = [...new Set([...(history.sent_keys || []), newKey])].slice(-100)
history.last_sent = new Date().toISOString()
if (!existsSync(dirname(ALERT_DEDUP_FILE))) mkdirSync(dirname(ALERT_DEDUP_FILE), { recursive: true })
writeFileSync(ALERT_DEDUP_FILE, JSON.stringify(history, null, 2))
