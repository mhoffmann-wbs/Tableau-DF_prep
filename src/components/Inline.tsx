/** Renders text with `backtick` spans as inline code (field names, calcs, menu items). Used for stems, options and rationales. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
          <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[0.9em] normal-case">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}
