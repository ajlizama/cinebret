'use client'

import { useState } from 'react'

type ShareData = {
  title: string
  text?: string
  url: string
  poster?: string
}

export default function ShareButton({
  data,
  className = '',
  children,
}: {
  data: ShareData
  className?: string
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    // Try native Web Share API first (iOS, Android)
    if (navigator.share) {
      try {
        await navigator.share({
          title: data.title,
          text: data.text || `Mira "${data.title}" en CineBret`,
          url: data.url,
        })
        return
      } catch {
        // User cancelled or API failed, fallback below
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Final fallback
      const input = document.createElement('input')
      input.value = data.url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button onClick={handleShare} className={className} title="Compartir">
      {children || (
        <span className="flex items-center gap-1.5 text-sm">
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copiado
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Compartir
            </>
          )}
        </span>
      )}
    </button>
  )
}
