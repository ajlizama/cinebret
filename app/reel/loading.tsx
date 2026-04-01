import Nav from '@/components/Nav'

export default function ReelLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <Nav active="reel" />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-72 space-y-3">
          <div className="w-72 h-[420px] rounded-3xl bg-zinc-800 animate-pulse" />
          <div className="flex justify-center gap-6">
            <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
            <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
            <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    </main>
  )
}
