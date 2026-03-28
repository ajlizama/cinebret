'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { parseSmartSearch, aiParseSearch, type SmartFilters } from '@/lib/smart-search'

type Props = {
  value: string
  onChange: (text: string) => void
  onSmartFilters: (filters: SmartFilters) => void
  placeholder?: string
}

export default function SmartSearchBar({ value, onChange, onSmartFilters, placeholder = 'Buscar película, director, actor...' }: Props) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [responseMsg, setResponseMsg] = useState<string | null>(null)
  const [usedMic, setUsedMic] = useState(false)
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [micSupported, setMicSupported] = useState(false)

  useEffect(() => {
    setMicSupported(!!(typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)))
  }, [])

  const showResponse = useCallback((msg: string, spokenByMic: boolean) => {
    setResponseMsg(msg)
    // Auto-scroll to catalog
    setTimeout(() => {
      const catalog = document.querySelector('[data-catalog]') || document.getElementById('catalogo')
      if (catalog) catalog.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
    // Speak if mic was used
    if (spokenByMic && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(msg)
      utterance.lang = 'es-CL'
      utterance.rate = 1.1
      utterance.pitch = 1.0
      // Try to find a Spanish voice
      const voices = window.speechSynthesis.getVoices()
      const esVoice = voices.find(v => v.lang.startsWith('es'))
      if (esVoice) utterance.voice = esVoice
      window.speechSynthesis.speak(utterance)
    }
    // Auto-hide after 6 seconds
    setTimeout(() => setResponseMsg(null), 6000)
  }, [])

  const processQuery = useCallback(async (query: string) => {
    if (!query || query.length < 3) return

    // First try local keyword parsing
    const local = parseSmartSearch(query)
    if (local.understood) {
      onSmartFilters(local)
      if (local.response) showResponse(local.response, usedMic)
      setUsedMic(false)
      return
    }

    // If not understood locally, try AI
    setProcessing(true)
    try {
      const ai = await aiParseSearch(query)
      if (ai && ai.understood) {
        onSmartFilters(ai)
        if (ai.response) showResponse(ai.response, usedMic)
      }
    } finally {
      setProcessing(false)
      setUsedMic(false)
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
    setUsedMic(true)
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
        className="w-full bg-zinc-900/80 backdrop-blur-md border border-zinc-600 rounded-2xl px-5 py-3.5 pr-24 text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-400/30 text-sm shadow-lg"
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
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
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
          className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-all"
          title="Buscar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Response popup */}
      {responseMsg && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 shadow-2xl flex items-start gap-3 animate-fade-in">
            <span className="text-lg shrink-0">🎬</span>
            <p className="text-sm text-zinc-200 leading-relaxed">{responseMsg}</p>
            <button onClick={() => setResponseMsg(null)} className="text-zinc-500 hover:text-white shrink-0 ml-auto">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
