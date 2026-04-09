/**
 * svgToPng — convert an inlined SVG element into a PNG blob/dataUrl.
 *
 * Used by the share/download flows in /posters and /tierlist (and any
 * future creation that needs a downloadable Instagram-style image).
 *
 * Caller is responsible for:
 *  - rendering the SVG offscreen with the desired width/height
 *  - passing the SVG element ref
 *
 * The function:
 *  1. Walks every <image href="..."> in the SVG and rewrites them to data
 *     URLs so the rasterizer doesn't trip on CORS / TMDB caching
 *  2. Serializes the SVG to a Blob URL
 *  3. Loads it into an Image, draws onto a canvas, returns a PNG data URL
 */

async function fetchAsDataUrl(url: string, attempts = 3): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch {
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)))
      }
    }
  }
  return null
}

export async function svgElementToPngDataUrl(
  svg: SVGElement,
  width: number,
  height: number,
  bgColor = '#0c0a09',
): Promise<string> {
  // Inline every <image> via data URLs so the canvas raster doesn't fail
  const imageEls = Array.from(svg.querySelectorAll('image'))
  const chunkSize = 4
  for (let i = 0; i < imageEls.length; i += chunkSize) {
    const chunk = imageEls.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map(async (el) => {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href')
        if (!href || href.startsWith('data:')) return
        const dataUrl = await fetchAsDataUrl(href)
        if (dataUrl) {
          el.setAttribute('href', dataUrl)
        } else {
          // Hide failed images so they don't break the raster
          el.setAttribute('href', '')
          el.setAttribute('opacity', '0')
        }
      }),
    )
  }

  const xml = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  const img = new window.Image()
  img.crossOrigin = 'anonymous'
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = (e) => reject(e)
  })
  img.src = svgUrl
  await loaded

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2d context')
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(svgUrl)

  return canvas.toDataURL('image/png')
}

/**
 * Convert a data URL to a File so we can pass it to navigator.share().
 * Native share with files works on iOS Safari, Android Chrome, etc.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/png'
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new File([arr], filename, { type: mime })
}

/**
 * Try the native share sheet with the PNG attached. Falls back to a plain
 * download if the browser doesn't support file sharing.
 */
export async function sharePngOrDownload(
  dataUrl: string,
  filename: string,
  shareData: { title?: string; text?: string },
): Promise<void> {
  const file = dataUrlToFile(dataUrl, filename)

  // Try native share with files first
  if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
    try {
      await (navigator as any).share({ ...shareData, files: [file] })
      return
    } catch {
      // user cancelled — don't fall through to download
      return
    }
  }

  // Fallback: trigger download
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
