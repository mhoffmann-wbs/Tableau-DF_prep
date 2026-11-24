import { type ChangeEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Inline } from '../components/Inline'
import { DOMAINS, LESSON_ORDER, TASK_BY_ID, tasksOf } from '../content/blueprint'
import { CARD_KIND_LABELS, DECK_FILE_APP, deckCardSchema, type DeckFile, FLASHCARDS, parseDeckFile } from '../content/flashcards'
import { buildSession, deckStats, INTERVAL_DAYS, intervalLabel, nextBox, type Rating } from '../flashcards/leitner'
import { type Deck, deleteDeck, rateCard, saveDeck, useProgress } from '../progress/store'
import { ShortcutHint } from '../quiz/ShortcutHint'
import { useShortcuts } from '../quiz/shortcuts'

/** New cards per session, after the due ones. */
const NEW_PER_SESSION = 20
const card = 'rounded-lg border border-slate-200 bg-white p-4'
const button = 'rounded border border-slate-300 px-3 py-1 text-sm'
const primary = 'rounded bg-brand px-4 py-2 text-sm text-chalk'

/** A card as the review screen shows it, built-in or own. */
interface ReviewCard {
  id: string
  front: string
  back: string
  /** "Chart recipe · 2.1 …" for built-in cards. */
  label?: string
  taskId?: string
}

const BUILT_IN: ReviewCard[] = [...FLASHCARDS]
  .sort((a, b) => LESSON_ORDER.indexOf(a.taskId) - LESSON_ORDER.indexOf(b.taskId))
  .map((c) => ({ ...c, label: `${CARD_KIND_LABELS[c.kind]} · ${c.taskId} ${TASK_BY_ID.get(c.taskId)?.title ?? ''}` }))

const ownCards = (deck: Deck): ReviewCard[] => deck.cards.map((c) => ({ ...c, label: deck.name }))

export default function FlashcardsPage() {
  const { deckId } = useParams()
  const [params] = useSearchParams()
  const { decks } = useProgress()
  if (deckId) return <DeckEditor key={deckId} deckId={deckId} />

  const task = params.get('task')
  const deck = params.get('deck')
  let scope: { title: string; cards: ReviewCard[] } | undefined
  if (task && TASK_BY_ID.has(task)) scope = { title: `${task} ${TASK_BY_ID.get(task)!.title}`, cards: BUILT_IN.filter((c) => c.taskId === task) }
  else if (params.get('all')) scope = { title: 'All built-in cards', cards: BUILT_IN }
  else if (deck) {
    const own = decks.find((d) => d.id === deck)
    if (own) scope = { title: own.name, cards: ownCards(own) }
  }
  // Keyed by the URL so a new scope starts a new session.
  if (scope) return <Session key={params.toString()} {...scope} />
  return <Overview />
}

function Counts({ ids, now }: { ids: string[]; now: number }) {
  const { flashcards } = useProgress()
  const { due, fresh } = deckStats(ids, flashcards, now)
  return (
    <span className="text-xs text-slate-500">
      {due} due · {fresh} new · {ids.length} cards
    </span>
  )
}

function Overview() {
  const { flashcards, decks } = useProgress()
  const [now] = useState(Date.now)
  const allIds = BUILT_IN.map((c) => c.id)
  const { boxes } = deckStats(allIds, flashcards, now)
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Flashcards</h1>
      <p className="text-slate-600">
        Terms, menu paths, file types, chart recipes and the blue/green rules, in Leitner boxes: rate a card <em>Again</em> and it comes back
        this session, <em>Good</em> moves it up one box and <em>Easy</em> up two. Box 0 to 5 bring it back after{' '}
        {INTERVAL_DAYS.join(', ')} days. A session shows the due cards first, then up to {NEW_PER_SESSION} new ones.
      </p>
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Built-in cards</h2>
          <Counts ids={allIds} now={now} />
        </div>
        <p className="mt-1 text-xs text-slate-500" aria-label="Cards per box">
          Boxes: {boxes.map((n, box) => `${box}: ${n}`).join(' · ')}
        </p>
        <Link to="?all=1" className={`mt-3 inline-block ${primary}`}>
          Review all
        </Link>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {DOMAINS.map((d) => (
            <div key={d.id}>
              <h3 className="text-sm font-semibold">
                {d.id}. {d.title}
              </h3>
              <ul className="mt-1 space-y-1">
                {tasksOf(d.id).map((t) => {
                  const ids = BUILT_IN.filter((c) => c.taskId === t.id).map((c) => c.id)
                  return (
                    <li key={t.id} className="text-sm">
                      {ids.length ? (
                        <Link to={`?task=${t.id}`} className="text-brand-dark underline-offset-2 hover:underline">
                          {t.id} {t.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400">
                          {t.id} {t.title}
                        </span>
                      )}{' '}
                      <Counts ids={ids} now={now} />
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className={card}>
        <h2 className="font-semibold">Your decks</h2>
        <p className="mt-1 text-sm text-slate-600">
          Make your own cards, or import a deck file a classmate exported. Deck files hold only the cards: your review state stays in this
          browser.
        </p>
        {decks.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {decks.map((d) => (
              <OwnDeckRow key={d.id} deck={d} now={now} />
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link to="/build/flashcards/deck/new" className={button}>
            New deck
          </Link>
          <ImportDeck />
        </div>
      </section>
      <p className="text-xs text-slate-500">
        Review state is saved with your progress, so the <Link to="/progress" className="underline">progress export</Link> includes it.
      </p>
    </div>
  )
}

function OwnDeckRow({ deck, now }: { deck: Deck; now: number }) {
  function download() {
    const file: DeckFile = { app: DECK_FILE_APP, name: deck.name, cards: deck.cards.map(({ front, back }) => ({ front, back })) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${deck.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'deck'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="font-medium">{deck.name}</span>
      <Counts ids={deck.cards.map((c) => c.id)} now={now} />
      <span className="ml-auto flex flex-wrap gap-2">
        {deck.cards.length > 0 && (
          <Link to={`?deck=${deck.id}`} className={button}>
            Review
          </Link>
        )}
        <Link to={`/build/flashcards/deck/${deck.id}`} className={button}>
          Edit
        </Link>
        <button onClick={download} className={button}>
          Export
        </button>
        <button
          onClick={() => window.confirm(`Delete the deck “${deck.name}” and its review state?`) && deleteDeck(deck.id)}
          className={`${button} text-red-700`}
        >
          Delete
        </button>
      </span>
    </li>
  )
}

function ImportDeck() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked again
    if (!file) return
    try {
      const deck = parseDeckFile(await file.text())
      saveDeck(deck)
      setMessage({ ok: true, text: `Imported “${deck.name}” (${deck.cards.length} cards).` })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
  }
  return (
    <>
      <label className={`cursor-pointer ${button}`}>
        Import a deck
        <input type="file" accept="application/json,.json" onChange={upload} className="sr-only" />
      </label>
      {message && (
        <p role="status" className={`w-full text-sm ${message.ok ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </>
  )
}

const RATING_KEYS: [Rating, string, string][] = [
  ['again', '1', 'Again'],
  ['good', '2', 'Good'],
  ['easy', '3', 'Easy'],
]

function Session({ title, cards }: { title: string; cards: ReviewCard[] }) {
  const { flashcards } = useProgress()
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  // The queue is fixed when the session starts; Again puts a card back at the end.
  const [queue, setQueue] = useState(() =>
    buildSession(
      cards.map((c) => c.id),
      flashcards,
      Date.now(),
      NEW_PER_SESSION,
    ),
  )
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState({ reviewed: 0, again: 0 })
  const current = byId.get(queue[index] ?? '')

  function answer(rating: Rating) {
    if (!current) return
    rateCard(current.id, rating)
    if (rating === 'again') setQueue((q) => [...q, current.id])
    setTally((t) => ({ reviewed: t.reviewed + 1, again: t.again + (rating === 'again' ? 1 : 0) }))
    setIndex((i) => i + 1)
    setRevealed(false)
  }

  useShortcuts(
    revealed
      ? Object.fromEntries(RATING_KEYS.map(([rating, key]) => [key, () => answer(rating)]))
      : { ' ': () => setRevealed(true), Enter: () => setRevealed(true) },
    current !== undefined,
  )

  const back = (
    <Link to="/build/flashcards" className="text-brand-dark underline">
      All decks
    </Link>
  )
  if (!current)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p role="status">
          {tally.reviewed === 0
            ? 'Nothing is due here and there are no new cards. Come back later.'
            : `Session complete: ${tally.reviewed} review${tally.reviewed === 1 ? '' : 's'}, ${tally.again} rated Again.`}
        </p>
        {back}
      </div>
    )

  const box = flashcards[current.id]?.box
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <span className="text-sm text-slate-500">
          Card {index + 1} of {queue.length} · {box === undefined ? 'new' : `box ${box}`}
        </span>
      </div>
      <section className={`${card} space-y-3`} aria-live="polite">
        {current.label && <p className="text-xs text-slate-500">{current.label}</p>}
        <p className="text-lg font-medium">
          <Inline text={current.front} />
        </p>
        {revealed && (
          <div className="border-t border-slate-200 pt-3">
            <p className="whitespace-pre-line">
              <Inline text={current.back} />
            </p>
            {current.taskId && (
              <p className="mt-2 text-xs">
                <Link to={`/learn/${current.taskId}`} className="text-brand-dark underline">
                  Lesson {current.taskId}
                </Link>
              </p>
            )}
          </div>
        )}
      </section>
      {revealed ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rate this card">
          {RATING_KEYS.map(([rating, , label]) => (
            <button key={rating} onClick={() => answer(rating)} className={rating === 'good' ? primary : `${button} py-2`}>
              {label} <span className="text-xs opacity-75">({intervalLabel(nextBox(flashcards[current.id], rating))})</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setRevealed(true)} className={primary}>
          Show answer
        </button>
      )}
      <ShortcutHint items={revealed ? [['1', 'Again'], ['2', 'Good'], ['3', 'Easy']] : [['Space', 'show answer']]} />
      {back}
    </div>
  )
}

interface Draft {
  id?: string
  front: string
  back: string
}

function DeckEditor({ deckId }: { deckId: string }) {
  const navigate = useNavigate()
  const { decks } = useProgress()
  const existing = decks.find((d) => d.id === deckId)
  const [name, setName] = useState(existing?.name ?? '')
  const [cards, setCards] = useState<Draft[]>(existing?.cards ?? [{ front: '', back: '' }])
  const [error, setError] = useState('')

  if (deckId !== 'new' && !existing)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Deck not found</h1>
        <Link to="/build/flashcards" className="text-brand-dark underline">
          All decks
        </Link>
      </div>
    )

  const edit = (i: number, patch: Partial<Draft>) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  function save() {
    // Rows left completely blank are dropped; half-filled ones need fixing.
    const kept = cards.filter((c) => c.front.trim() || c.back.trim())
    if (!name.trim()) return setError('Give the deck a name.')
    const bad = kept.findIndex((c) => !deckCardSchema.safeParse(c).success)
    if (bad >= 0) return setError(`Card ${cards.indexOf(kept[bad]!) + 1} needs a front and a back (up to 200 and 400 characters).`)
    saveDeck({ id: existing?.id, name: name.trim(), cards: kept.map((c) => ({ ...c, front: c.front.trim(), back: c.back.trim() })) })
    navigate('/build/flashcards')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{existing ? `Edit “${existing.name}”` : 'New deck'}</h1>
      <label className="block text-sm">
        Deck name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 block w-full max-w-md rounded border border-slate-300 bg-white px-2 py-1" />
      </label>
      <ol className="space-y-3">
        {cards.map((c, i) => (
          <li key={c.id ?? `draft-${i}`} className={`${card} grid gap-2 sm:grid-cols-[1fr_1fr_auto]`}>
            <label className="text-sm">
              Card {i + 1} front
              <textarea value={c.front} onChange={(e) => edit(i, { front: e.target.value })} maxLength={200} rows={2} className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1" />
            </label>
            <label className="text-sm">
              Card {i + 1} back
              <textarea value={c.back} onChange={(e) => edit(i, { back: e.target.value })} maxLength={400} rows={2} className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1" />
            </label>
            <button onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))} className={`${button} self-end`} aria-label={`Remove card ${i + 1}`}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-500">Wrap code or formulas in `backticks`. Removing a card also removes its review state.</p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCards((cs) => [...cs, { front: '', back: '' }])} className={button}>
          Add a card
        </button>
        <button onClick={save} className={primary}>
          Save deck
        </button>
        <Link to="/build/flashcards" className={`${button} py-2`}>
          Cancel
        </Link>
      </div>
    </div>
  )
}
