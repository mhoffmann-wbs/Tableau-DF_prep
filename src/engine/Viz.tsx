import { useEffect, useRef, useState } from 'react'
import { EngineError } from './pills'
import { LIGHT_THEME, type Theme } from './render'
import type { MarkMembers } from './runtime'
import type { VizSpec } from './spec'

/** Chart colours from the theme tokens, so charts follow dark mode. */
function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    text: v('--color-slate-700', LIGHT_THEME.text),
    muted: v('--color-slate-500', LIGHT_THEME.muted),
    grid: v('--color-slate-200', LIGHT_THEME.grid),
    land: v('--color-slate-200', LIGHT_THEME.land),
  }
}

type DrawState = { key: string } & ({ status: 'ready' } | { status: 'error'; message: string })

/** Draws a viz spec over the Driftlight data. The engine loads on first use. With `onMark`, clicks on marks are reported. */
export function Viz({ spec, title, onMark }: { spec: VizSpec; title?: string; onMark?: (members: MarkMembers, additive: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // The latest callback, so a new one doesn't redraw the chart.
  const markRef = useRef(onMark)
  useEffect(() => {
    markRef.current = onMark
  })
  const selectable = onMark !== undefined
  // The spec's JSON identifies the drawing: a structurally equal spec doesn't redraw.
  const key = JSON.stringify(spec)
  const [drawn, setDrawn] = useState<DrawState | undefined>()
  const state = drawn?.key === key ? drawn : ({ status: 'loading' } as const)

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined
    import('./runtime')
      .then((m) => m.renderViz(ref.current!, JSON.parse(key) as VizSpec, readTheme(), selectable ? (members, additive) => markRef.current?.(members, additive) : undefined))
      .then((finalize) => {
        if (cancelled) return finalize()
        cleanup = finalize
        setDrawn({ key, status: 'ready' })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof EngineError ? e.message : `This chart couldn’t be drawn: ${e instanceof Error ? e.message : String(e)}`
        setDrawn({ key, status: 'error', message })
      })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [key, selectable])

  return (
    <figure className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-3" aria-label={title ?? 'Chart'} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && <p className="text-sm text-slate-500">Drawing the chart…</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div ref={ref} className={state.status === 'error' ? 'hidden' : undefined} />
    </figure>
  )
}
