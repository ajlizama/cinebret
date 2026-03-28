'use client'

import { useState, useEffect } from 'react'

type Album = {
  id: string
  name: string
  artist: string
  image: string | null
  url: string | null
  embedUrl: string
}

export default function SpotifyPlayer({ movieTitle }: { movieTitle: string }) {
  const [album, setAlbum] = useState<Album | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/spotify-search?q=${encodeURIComponent(movieTitle)}`)
      .then(r => r.json())
      .then(d => { setAlbum(d.album); setLoading(false) })
      .catch(() => setLoading(false))
  }, [movieTitle])

  if (loading || !album) return null

  return (
    <div>
      <div
        className="flex items-center gap-3 bg-zinc-800/50 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-zinc-800 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <svg className="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{album.name}</p>
          <p className="text-zinc-500 text-[10px] truncate">{album.artist}</p>
        </div>
        <span className="text-zinc-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="mt-2 rounded-xl overflow-hidden">
          <iframe
            src={album.embedUrl}
            width="100%"
            height="352"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="rounded-xl"
          />
        </div>
      )}
    </div>
  )
}
