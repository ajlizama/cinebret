'use client'

import { useRouter } from 'next/navigation'

export default function BackButton({ label = '← Volver' }: { label?: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-zinc-500 hover:text-white transition-colors mb-6 block"
    >
      {label}
    </button>
  )
}
