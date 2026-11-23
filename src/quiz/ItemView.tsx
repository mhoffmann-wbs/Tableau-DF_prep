import { OBJECTIVE_BY_ID, TASK_BY_ID } from '../content/blueprint'
import { type Item, selectCount } from '../content/schema'
import { Inline } from '../components/Inline'
import { Shelves } from '../engine/Shelves'
import { Viz } from '../engine/Viz'
import type { Response } from './grade'
import { type ShortcutMap, useShortcuts } from './shortcuts'

const COUNT_WORDS = ['ONE', 'TWO', 'THREE']
const LETTERS = 'ABCDEF'

interface Props {
  item: Item
  response: Response
  onChange: (response: Response) => void
  /** When true, inputs lock and the key, every rationale, the explanation and the objectives are shown. */
  revealed?: boolean
  /** Select options with 1–6 or A–F. Only one ItemView on screen should enable this. */
  keyboard?: boolean
  /** Name the task above the stem. The mock exam hides it, as the real exam does. */
  showTask?: boolean
}

export function ItemView({ item, response, onChange, revealed = false, keyboard = false, showTask = true }: Props) {
  const task = TASK_BY_ID.get(item.taskId)!
  return (
    <article className="space-y-4" data-item-id={item.id}>
      {showTask && (
        <p className="text-xs tracking-wide text-slate-500 uppercase">
          {task.id} {task.title}
        </p>
      )}
      <p className="text-lg leading-relaxed whitespace-pre-line">
        <Inline text={item.stem} />
      </p>
      {item.kind === 'viz' && (
        <div className="space-y-2">
          {item.viz.show !== 'chart' && <Shelves spec={item.viz.spec} />}
          {item.viz.show !== 'shelves' && <Viz spec={item.viz.spec} title="Chart for this question" />}
        </div>
      )}
      <Options item={item} response={response} onChange={onChange} revealed={revealed} keyboard={keyboard} />
      {revealed && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Explanation</h3>
          <p className="whitespace-pre-line">
            <Inline text={item.explanation} />
          </p>
          {item.sourceLinks && (
            <p className="text-sm">
              Tableau help:{' '}
              {item.sourceLinks.map((url, i) => (
                <span key={url}>
                  {i > 0 && ' · '}
                  <a href={url} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                    {new URL(url).pathname.split('/').pop()}
                  </a>
                </span>
              ))}
            </p>
          )}
          <ul className="text-xs text-slate-500">
            {item.objectives.map((id) => (
              <li key={id}>
                Objective {id}: {OBJECTIVE_BY_ID.get(id)?.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function Options({ item, response, onChange, revealed, keyboard }: Omit<Props, 'showTask'>) {
  const select = selectCount(item)
  const multi = select > 1

  function toggle(i: number) {
    if (revealed) return
    if (!multi) return onChange([i])
    if (response.includes(i)) return onChange(response.filter((s) => s !== i))
    // Like the real exam, don't allow more selections than the item asks for.
    if (response.length < select) onChange([...response, i])
  }

  const keys: ShortcutMap = {}
  item.options.forEach((_, i) => {
    keys[String(i + 1)] = () => toggle(i)
    keys[LETTERS[i]!.toLowerCase()] = () => toggle(i)
  })
  useShortcuts(keys, !!keyboard && !revealed)

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-slate-600">Select {COUNT_WORDS[select - 1]}.</legend>
      {item.options.map((option, i) => {
        const isSelected = response.includes(i)
        const tone = !revealed
          ? isSelected
            ? 'border-brand bg-brand/5'
            : 'border-slate-200 bg-white hover:border-slate-400'
          : option.correct
            ? 'border-green-600 bg-green-50'
            : isSelected
              ? 'border-red-600 bg-red-50'
              : 'border-slate-200 bg-white opacity-80'
        return (
          <label key={i} className={`block cursor-pointer rounded-lg border-2 p-3 transition-colors ${tone}`}>
            <span className="flex gap-3">
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={item.id}
                checked={isSelected}
                disabled={revealed}
                onChange={() => toggle(i)}
                className="mt-1 accent-brand"
              />
              <span className="font-semibold">{LETTERS[i]}.</span>
              <span>
                <Inline text={option.text} />
              </span>
            </span>
            {revealed && (
              <span className="mt-2 block pl-7 text-sm text-slate-700">
                <span className="font-semibold">{option.correct ? '✓ ' : '✗ '}</span>
                <Inline text={option.rationale} />
              </span>
            )}
          </label>
        )
      })}
    </fieldset>
  )
}
