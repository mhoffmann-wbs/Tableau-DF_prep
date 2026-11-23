import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

/**
 * A button that opens a menu of actions. Arrow keys move between items, Escape
 * and a click outside close it, and focus returns to the button. Items get a
 * `close` callback so an action can close the menu.
 */
export function MenuButton({
  label,
  className,
  menuLabel,
  children,
  ...buttonProps
}: {
  label: ReactNode
  className?: string
  /** The menu's accessible name. */
  menuLabel: string
  children: (close: () => void) => ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  // `refocus`: closed from inside the menu, so focus goes back to the button.
  const [{ open, refocus }, setState] = useState({ open: false, refocus: false })
  const setOpen = (o: boolean) => setState({ open: o, refocus: false })
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => setState({ open: false, refocus: true })

  useEffect(() => {
    if (!open) {
      if (refocus) button.current?.focus()
      return
    }
    panel.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setState({ open: false, refocus: false })
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, refocus])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <span className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={className}
        {...buttonProps}
      >
        {label}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onKeyDown}
          className="absolute top-full left-0 z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-800 shadow-lg"
        >
          {children(close)}
        </div>
      )}
    </span>
  )
}

export function MenuItem({ onSelect, checked, children }: { onSelect: () => void; checked?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      tabIndex={-1}
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
    >
      {checked !== undefined && <span className="w-3 text-brand-dark">{checked ? '✓' : ''}</span>}
      {children}
    </button>
  )
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className="mt-1 border-t border-slate-100 px-3 pt-1.5 pb-0.5 text-xs font-semibold tracking-wide text-slate-500 uppercase first:mt-0 first:border-t-0">
      {children}
    </div>
  )
}
