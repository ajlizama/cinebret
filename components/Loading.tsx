'use client'

export default function Loading({ text, size = 'md' }: { text?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-14 h-14'
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
      <video
        src="/loading.mp4"
        autoPlay
        muted
        loop
        playsInline
        className={`${dims} object-contain`}
        style={{ mixBlendMode: 'lighten' }}
      />
      {text && <p className="text-zinc-500 text-sm">{text}</p>}
    </div>
  )
}
