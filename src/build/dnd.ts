// Drag and drop between the Data pane and the shelves, with the HTML5 API.
// Every drag has a keyboard and touch alternative in the field and pill menus.
import { type DragEvent, useState } from 'react'
import type { PillAt } from '../engine/edit'
import type { AnalyticsItem } from './AnalyticsPane'

const MIME = 'application/x-tableau-df-sandbox'

export type Dragged = { kind: 'field'; field: string } | { kind: 'pill'; at: PillAt } | { kind: 'analytics'; item: AnalyticsItem }

export function startDrag(e: DragEvent, dragged: Dragged) {
  e.dataTransfer.setData(MIME, JSON.stringify(dragged))
  e.dataTransfer.effectAllowed = 'move'
}

/** Props for a drop target, plus whether something is being dragged over it. */
export function useDropTarget(onDrop: (d: Dragged) => void, accepts: (d: Dragged['kind']) => boolean = () => true) {
  const [over, setOver] = useState(false)
  // The payload can only be read on drop, so dragover accepts any sandbox drag.
  const ours = (e: DragEvent) => e.dataTransfer.types.includes(MIME)
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!ours(e)) return
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        if (!ours(e)) return
        e.preventDefault()
        e.stopPropagation()
        const d = JSON.parse(e.dataTransfer.getData(MIME)) as Dragged
        if (accepts(d.kind)) onDrop(d)
      },
    },
  }
}
