'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { parseSmartSearch, aiParseSearch, type SmartFilters } from '@/lib/smart-search'

type Props = {
  value: string
  onChange: (text: string) => void
  onSmartFilters: (filters: SmartFilters) => void
  onScrollToCatalog?: () => void
  placeholder?: string
}

export default function SmartSearchBar({ value, onChange, onSmartFilters, onScrollToCatalog, placeholder = 'Buscar película, director, actor...' }: Props) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [responseMsg, setResponseMsg] = useState<string | null>(null)
  const usedMicRef = useRef(false)
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [micSupported, setMicSupported] = useState(false)

  useEffect(() => {
    setMicSupported(!!(typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)))
  }, [])

  const showResponse = useCallback((msg: string, spokenByMic: boolean) => {
    setResponseMsg(msg)
    // Auto-scroll to catalog (longer delay on mobile for render)
    setTimeout(() => { onScrollToCatalog?.() }, 800)
    // Speak if mic was used
    if (spokenByMic && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Load voices first (needed on some browsers)
      const speak = () => {
        const utterance = new SpeechSynthesisUtterance(msg)
        utterance.lang = 'es-MX'
        utterance.rate = 1.05
        utterance.pitch = 1.0
        const voices = window.speechSynthesis.getVoices()
        // Prefer: Rocko MX > Paulina > Google español > any es-*
        const rocko = voices.find(v => v.name.includes('Rocko') && v.lang.includes('MX'))
        const paulina = voices.find(v => v.name.includes('Paulina'))
        const google = voices.find(v => v.name.includes('Google español'))
        const anyEs = voices.find(v => v.lang.startsWith('es'))
        utterance.voice = rocko ?? paulina ?? google ?? anyEs ?? null
        window.speechSynthesis.cancel() // cancel any pending
        window.speechSynthesis.speak(utterance)
      }
      if (window.speechSynthesis.getVoices().length > 0) speak()
      else window.speechSynthesis.onvoiceschanged = speak
    }
    // Auto-hide after 8 seconds
    setTimeout(() => setResponseMsg(null), 8000)
  }, [onScrollToCatalog])

  const processQuery = useCallback(async (query: string) => {
    if (!query || query.length < 3) return

    // First try local keyword parsing
    const local = parseSmartSearch(query)
    if (local.understood) {
      onSmartFilters(local)
      if (local.response) showResponse(local.response, usedMicRef.current)
      usedMicRef.current = false
      return
    }

    // If not understood locally, try AI
    setProcessing(true)
    try {
      const ai = await aiParseSearch(query)
      if (ai && ai.understood) {
        onSmartFilters(ai)
        if (ai.response) showResponse(ai.response, usedMicRef.current)
      }
    } finally {
      setProcessing(false)
      usedMicRef.current = false
    }
  }, [onSmartFilters])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      processQuery(value)
    }
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-CL'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    let finalTranscript = ''
    let silenceTimer: ReturnType<typeof setTimeout> | null = null

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' '
        } else {
          interim = event.results[i][0].transcript
        }
      }
      onChange((finalTranscript + interim).trim())

      // Reset silence timer — process after 2s of silence
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => {
        recognition.stop()
        const text = finalTranscript.trim()
        if (text) processQuery(text)
        setListening(false)
      }, 2000)
    }

    recognition.onerror = () => { if (silenceTimer) clearTimeout(silenceTimer); setListening(false) }
    recognition.onend = () => { if (silenceTimer) clearTimeout(silenceTimer); setListening(false) }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
    usedMicRef.current = true
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  return (
    <div className="relative w-full max-w-xl">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-zinc-900/80 backdrop-blur-md border border-zinc-600 rounded-2xl px-5 py-3.5 pr-24 text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-400/30 text-base md:text-sm shadow-lg"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {/* Processing indicator */}
        {processing && (
          <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        )}

        {/* Mic button — only when browser supports it */}
        {micSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              listening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title={listening ? 'Detener' : 'Buscar con voz'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>
        )}

        {/* Search button */}
        <button
          type="button"
          onClick={() => processQuery(value)}
          className="w-11 h-11 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-all"
          title="Buscar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Response popup — fixed center screen */}
      {responseMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-2xl px-6 py-4 shadow-2xl max-w-sm mx-4 pointer-events-auto">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🎬</span>
              <p className="text-sm text-zinc-200 leading-relaxed flex-1">{responseMsg}</p>
              <button onClick={() => setResponseMsg(null)} className="text-zinc-500 hover:text-white shrink-0 text-lg">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
