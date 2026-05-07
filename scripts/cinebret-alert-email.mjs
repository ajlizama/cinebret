// CineBret Alert Email — daily content recommendations.
//
// Design system:
//   - Pattern: Swiss Modernism 2.0 (editorial, mathematical spacing, single accent)
//   - Inspiration: Vercel/Linear/Apple system emails
//   - Tokens documented in inline comments below
//
// Three blocks:
//   1. Propuestas — up to 5 actionable cards (gold left-border accent)
//   2. Noticias — informational, single container with internal dividers
//   3. Backlog — compact cards, lower visual weight

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
if (!proposals) { console.log('No proposals file.'); process.exit(0) }

const top = proposals.top || []
const backlog = proposals.backlog || []
const news = proposals.news || []

if (!proposals.passes_quality_gate && !FORCE) {
  console.log(`Quality gate fail. top=${top.length} backlog=${backlog.length} news=${news.length}.`)
  process.exit(0)
}

console.log(`Building digest: ${top.length} propuestas · ${backlog.length} backlog · ${news.length} noticias\n`)

// Dedup against history
const history = readJsonOrEmpty(ALERT_DEDUP_FILE) || { sent_keys: [] }
const today = new Date().toISOString().slice(0, 10)
const dedupKey = `${today}:${proposals.cycle}:${top.map(p => p.id || (p.action + ':' + p.title.slice(0, 30))).join('|')}`
if (history.sent_keys?.includes(dedupKey) && !FORCE) {
  console.log('Already sent this exact digest. Use --force to send again.'); process.exit(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bgBase:    '#0A0A0A',
  bgElev1:   '#111114',
  bgElev2:   '#18181C',
  border:    '#27272A',
  borderHi:  '#3F3F46',
  text1:     '#FAFAFA',
  text2:     '#A1A1AA',
  text3:     '#71717A',
  gold:      '#FACC15',
  goldDim:   '#CA8A04',
  goldSoft:  'rgba(250, 204, 21, 0.08)',
  purple:    '#A78BFA',
  purpleDim: '#6D28D9',
}

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
const FONT_MONO = `'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace`

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function priorityLabel(p) {
  if (p === 'alta') return 'PRIORIDAD ALTA'
  if (p === 'media') return 'PRIORIDAD MEDIA'
  return 'PRIORIDAD BAJA'
}

function categoryLabel(cat) {
  return ({
    review: 'REVIEW',
    contenido: 'CONTENIDO',
    top: 'LISTA / TOP',
  }[cat] || 'CONTENIDO')
}

// P1: Hierarchy by category — single-accent gold-family + gray. Reviews are the
// editorial hero (full gold), tops are secondary (dimmed gold), contenido is
// neutral (gray). No new accent colors introduced.
function categoryAccent(cat) {
  if (cat === 'review')   return { border: C.gold,    meta: C.gold }
  if (cat === 'top')      return { border: C.goldDim, meta: C.goldDim }
  return                         { border: C.borderHi, meta: C.text2 }
}

// P2: human-friendly age label
function ageLabel(daysAgo) {
  if (daysAgo == null || daysAgo < 0) return ''
  if (daysAgo === 0) return 'DEL CICLO ANTERIOR'
  if (daysAgo === 1) return 'HACE 1 DÍA'
  return `HACE ${daysAgo} DÍAS`
}

// P3: fallback for legacy backlog entries that lack `category`
function safeCategory(cat) {
  return cat === 'review' || cat === 'top' || cat === 'contenido' ? cat : 'contenido'
}

// ─────────────────────────────────────────────────────────────────────────────
// Card builders
// ─────────────────────────────────────────────────────────────────────────────

// Token-pill — used for catalog / director tags inside news rows
function pill(label, color) {
  return `<span style="display:inline-block;font-size:11px;font-weight:500;padding:2px 8px;border-radius:4px;background:${C.goldSoft};color:${color};letter-spacing:0;line-height:1.4;margin-right:6px;">${label}</span>`
}

function proposalCard(p, idx) {
  const cat = safeCategory(p.category)
  const accent = categoryAccent(cat)
  // P4: split meta-row — left side identifies, right side shows priority
  const leftMeta = `${String(idx + 1).padStart(2, '0')} · ${categoryLabel(cat)}`
  const rightMeta = priorityLabel(p.priority)

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
  <tr>
    <td style="background:${C.bgElev1};border:1px solid ${C.border};border-left:3px solid ${accent.border};border-radius:12px;padding:22px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
        <tr>
          <td align="left" style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:${accent.meta};text-transform:uppercase;">
            ${leftMeta}
          </td>
          <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:${C.text3};text-transform:uppercase;">
            ${rightMeta}
          </td>
        </tr>
      </table>
      <div style="font-size:17px;font-weight:600;line-height:1.35;letter-spacing:-0.01em;color:${C.text1};margin:0 0 8px;">
        ${clean(p.title)}
      </div>
      <div style="font-size:14px;line-height:1.55;color:${C.text2};margin:0 0 14px;">
        ${clean(p.reasoning)}
      </div>
      ${p.skill_to_invoke ? `
      <div style="margin:0 0 ${p.source_url ? '10px' : '0'};">
        <code style="display:inline-block;background:${C.bgBase};border:1px solid ${C.border};color:${C.gold};font-family:${FONT_MONO};font-size:12px;font-weight:500;padding:5px 10px;border-radius:6px;">${p.skill_to_invoke}</code>
      </div>` : ''}
      ${p.source_url ? `
      <div>
        <a href="${p.source_url}" style="color:${C.gold};text-decoration:none;font-size:12px;font-weight:500;">Ver fuente original →</a>
      </div>` : ''}
    </td>
  </tr>
</table>`
}

function newsRow(n, isLast) {
  const tags = []
  if (n.catalog_match) {
    tags.push(`<span style="display:inline-block;font-size:11px;color:${C.gold};letter-spacing:0;">en tu catálogo · ${clean(n.catalog_match.titulo || n.catalog_match)}</span>`)
  }
  if (n.angle && n.angle !== 'cultural-moment' && n.angle !== 'mention') {
    tags.push(`<span style="display:inline-block;font-size:11px;color:${C.text3};letter-spacing:0;margin-left:10px;">${n.angle}</span>`)
  }
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td style="padding:18px 22px;${isLast ? '' : `border-bottom:1px solid ${C.border};`}">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:${C.text3};text-transform:uppercase;margin:0 0 8px;">
        ${clean(n.source || '')} · ${n.age_hours !== undefined ? n.age_hours + 'H' : ''}
      </div>
      <div style="font-size:15px;font-weight:500;line-height:1.4;color:${C.text1};margin:0 0 6px;">
        ${clean(n.title_es || n.title)}
      </div>
      ${n.summary_es ? `
      <div style="font-size:13px;line-height:1.55;color:${C.text2};margin:0 0 ${tags.length || n.url ? '10px' : '0'};">
        ${clean(n.summary_es)}
      </div>` : ''}
      ${tags.length ? `<div style="margin-bottom:${n.url ? '10px' : '0'};">${tags.join('')}</div>` : ''}
      ${n.url ? `
      <div>
        <a href="${n.url}" style="color:${C.gold};text-decoration:none;font-size:12px;font-weight:500;">Ver fuente →</a>
      </div>` : ''}
    </td>
  </tr>
</table>`
}

function backlogCard(p) {
  const cat = safeCategory(p.category)
  const days = p.days_ago != null ? p.days_ago : 0
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
  <tr>
    <td style="background:${C.bgElev2};border:1px solid ${C.border};border-radius:10px;padding:14px 18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:${C.text3};text-transform:uppercase;margin:0 0 6px;">
        ${categoryLabel(cat)} · ${ageLabel(days)}
      </div>
      <div style="font-size:14px;font-weight:500;line-height:1.4;color:${C.text1};margin:0 0 4px;">
        ${clean(p.title)}
      </div>
      <div style="font-size:12px;line-height:1.5;color:${C.text2};">
        ${clean(p.reasoning || '')}
      </div>
    </td>
  </tr>
</table>`
}

function sectionHeading(num, label, sub) {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:48px 0 18px;">
  <tr>
    <td>
      <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;color:${C.gold};text-transform:uppercase;margin:0 0 6px;">
        ${num} · ${label}
      </div>
      ${sub ? `
      <div style="font-size:14px;line-height:1.55;color:${C.text2};">
        ${sub}
      </div>` : ''}
    </td>
  </tr>
</table>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject
// ─────────────────────────────────────────────────────────────────────────────

const cycleLabel = proposals.cycle === 'pm' ? 'tarde' : 'mañana'
const reviewCount = top.filter(p => p.category === 'review').length
const contenidoCount = top.filter(p => p.category === 'contenido').length
const topCount = top.filter(p => p.category === 'top').length
const subjectParts = []
if (reviewCount > 0) subjectParts.push(`${reviewCount} review${reviewCount === 1 ? '' : 's'}`)
if (contenidoCount > 0) subjectParts.push(`${contenidoCount} contenido`)
if (topCount > 0) subjectParts.push(`${topCount} top`)
if (backlog.length > 0) subjectParts.push(`${backlog.length} backlog`)
const subject = top.length > 0
  ? `CineBret · ${cycleLabel} · ${subjectParts.join(' · ')}`
  : `CineBret · ${cycleLabel} · sin propuestas hoy`

// ─────────────────────────────────────────────────────────────────────────────
// Build HTML
// ─────────────────────────────────────────────────────────────────────────────

const dateLong = new Date().toLocaleString('es-CL', {
  timeZone: 'America/Santiago',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const headerBlock = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid ${C.border};padding-bottom:24px;margin-bottom:0;">
  <tr>
    <td>
      <div style="font-family:${FONT};font-size:30px;font-weight:700;color:${C.gold};letter-spacing:-0.03em;line-height:1.1;margin:0 0 8px;">
        CineBret
      </div>
      <div style="font-family:${FONT};font-size:13px;font-weight:400;color:${C.text2};line-height:1.4;text-transform:capitalize;">
        ${dateLong} · ciclo ${(proposals.cycle || '').toUpperCase()}
      </div>
    </td>
  </tr>
</table>`

const proposalsBlock = top.length > 0 ? `
${sectionHeading('01', `${top.length} propuestas accionables`, 'Mix editorial: reviews · contenido · listas. Si no las tomas hoy, mañana van al backlog.')}
${top.map(proposalCard).join('')}
` : `
${sectionHeading('01', 'Sin propuestas hoy', 'Las señales de hoy no superaron el filtro. Revisa el backlog si quedan pendientes.')}`

const newsBlock = news.length > 0 ? `
${sectionHeading('02', `${news.length} noticias filtradas`, 'Solo noticias con match en tu catálogo o director del olimpo. Tú decides si reaccionas o no.')}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bgElev1};border:1px solid ${C.border};border-radius:12px;">
  <tr><td>
    ${news.map((n, i) => newsRow(n, i === news.length - 1)).join('')}
  </td></tr>
</table>` : ''

const backlogBlock = backlog.length > 0 ? `
${sectionHeading('03', `${backlog.length} pendientes en backlog`, 'Propuestas anteriores que aún no tomaste. Vigentes hasta 14 días.')}
${backlog.map(backlogCard).join('')}` : ''

const footerBlock = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${C.border};margin-top:64px;padding-top:24px;">
  <tr>
    <td style="font-family:${FONT};font-size:11px;line-height:1.7;color:${C.text3};">
      <div style="margin-bottom:6px;">Señales analizadas: ${proposals.raw_signal_counts?.news_items || 0} news · ${proposals.raw_signal_counts?.newsapi_items || 0} newsapi · ${proposals.raw_signal_counts?.reddit_posts || 0} reddit · ${proposals.raw_signal_counts?.trailers || 0} trailers</div>
      ${proposals.ig_mix ? `<div style="margin-bottom:6px;">Mix últimos 6 posts: review ${proposals.ig_mix.last6_counts.review}/3 · contenido ${proposals.ig_mix.last6_counts.contenido}/1 · top ${proposals.ig_mix.last6_counts.top}/2</div>` : ''}
      ${proposals.reconciliation_stats ? `<div style="margin-bottom:6px;">Historial: ${proposals.reconciliation_stats.acceptedCount || 0} aceptadas · ${proposals.reconciliation_stats.expiredByCritic || 0} expiradas por crítico · ${proposals.reconciliation_stats.expiredByTime || 0} expiradas por tiempo</div>` : ''}
      <div style="margin-bottom:14px;">Cron: 8 AM + 5 PM Chile · GitHub Actions · cinebret-agent.yml</div>
      <div>Para ejecutar una propuesta:&nbsp;<code style="display:inline-block;background:${C.bgElev1};border:1px solid ${C.border};color:${C.gold};font-family:${FONT_MONO};font-size:11px;padding:3px 8px;border-radius:5px;">claude → "qué publicamos hoy"</code></div>
    </td>
  </tr>
</table>`

const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>CineBret · ${cycleLabel}</title>
<style type="text/css">
  /* Inter font (loaded by mail clients that allow it; falls back to system) */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  body, table, td, p, div { font-family: ${FONT}; }
  a { text-decoration: none; }
  @media only screen and (max-width: 600px) {
    .px-outer { padding-left: 20px !important; padding-right: 20px !important; }
    .py-outer { padding-top: 28px !important; padding-bottom: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bgBase};color:${C.text1};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-family:${FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bgBase};">
  <tr>
    <td align="center" class="py-outer" style="padding:48px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;">
        <tr>
          <td class="px-outer" style="padding:0 8px;">
            ${headerBlock}
            ${proposalsBlock}
            ${newsBlock}
            ${backlogBlock}
            ${footerBlock}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

// ─────────────────────────────────────────────────────────────────────────────
// Send / dry-run
// ─────────────────────────────────────────────────────────────────────────────

if (DRY_RUN || !RESEND_KEY) {
  console.log('--- EMAIL PREVIEW ---')
  console.log(`To: ${TO_EMAIL}`)
  console.log(`Subject: ${subject}`)
  console.log(`\nPropuestas (${top.length}):`)
  top.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.category}/${p.type}] ${decodeHtmlEntities(p.title)}`)
    console.log(`     ${decodeHtmlEntities(p.reasoning)}`)
  })
  console.log(`\nNoticias (${news.length}):`)
  news.forEach(n => console.log(`  - ${n.source} (${n.age_hours}h): ${decodeHtmlEntities(n.title_es || n.title)}`))
  console.log(`\nBacklog (${backlog.length}):`)
  backlog.forEach(b => console.log(`  - [${b.category}] ${decodeHtmlEntities(b.title)} (${b.days_ago}d)`))

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

history.sent_keys = [...new Set([...(history.sent_keys || []), dedupKey])].slice(-100)
history.last_sent = new Date().toISOString()
if (!existsSync(dirname(ALERT_DEDUP_FILE))) mkdirSync(dirname(ALERT_DEDUP_FILE), { recursive: true })
writeFileSync(ALERT_DEDUP_FILE, JSON.stringify(history, null, 2))
