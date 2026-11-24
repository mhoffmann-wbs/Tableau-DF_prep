import { useEffect, useState } from 'react'
import type { SourceRef } from '../engine/model'
import type { Member } from '../engine/runtime'
import type { Pill } from '../engine/spec'

/** The members of a discrete pill, loaded from the data with the engine's lazy chunk; undefined while loading. */
export function useMembers(source: SourceRef, pill: Pill): Member[] | undefined {
  const loadKey = JSON.stringify([source, pill])
  const [loaded, setLoaded] = useState<{ key: string; members: Member[] }>()

  useEffect(() => {
    let cancelled = false
    const [ref, p] = JSON.parse(loadKey) as [SourceRef, Pill]
    import('../engine/runtime')
      .then((m) => m.membersOf(ref, p))
      .then((list) => !cancelled && setLoaded({ key: loadKey, members: list }))
    return () => {
      cancelled = true
    }
  }, [loadKey])

  return loaded?.key === loadKey ? loaded.members : undefined
}

/** How a manual sort names a member: the label for date parts (whose value is a number), else the underlying member. */
export const manualKey = (m: Member): string => (typeof m.value === 'number' ? m.label : m.value)
