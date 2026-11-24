# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Tableau-DF_prep** is a static self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Analytics-101), in English, for data bootcamp learners new to Tableau. Pillars: **Learn** (one lesson per task, 12), **Check** (practice, the question bank, a 40-item/70-minute mock passing at 48%) and **Build** (a viz builder sandbox, a calc playground, concept simulators, Tableau Public challenges and flashcards, in place of a coding lab). Every scenario uses one invented streaming service, **Driftlight**, and its generated dataset.

**`PLAN.md` is the build plan and sets the order of work** (decisions, blueprint → content map, item kinds, dataset, Build pillar, phases). §9 records what is done; mark a phase or substep done there with the date, and update the docs below so they describe what exists.

## Authoritative sources

- Exam guide: https://help.salesforce.com/s/articleView?id=005298988&type=1. It's the single source of truth for domains, weights, tasks, objectives and exam format. The page is rendered with JavaScript, so WebFetch returns an empty shell: ask the user to paste the current text. When it changes, update `src/content/blueprint.ts` first. The content tests then show what has to follow.
- The exam tests **Tableau 2022.3**, but only the current help is online (https://help.tableau.com/current/pro/desktop/en-us/default.htm; versioned `/v20xx.x/` paths return 404). Before teaching a feature as exam material, check in the release notes (https://www.tableau.com/products/new-features) that it existed in 2022.3.
- The footer and README say "Not affiliated with or endorsed by Salesforce, Inc. or Tableau."

## Rules that span the codebase

- **Content is data.** Lessons, questions, calc exercises, challenges, flashcards and guides are files under `src/content/`, validated with Zod and rendered generically. To add content, add data, not a component. The exception is the simulators, which are components, though their copy is data.
- **One engine.** `src/engine/` (data model, query layer, calc evaluator, Vega-Lite renderer) is shared by the sandbox, `viz` items, lesson embeds, simulators and challenge checkpoints. Don't build a second chart path.
- **Numbers come from the data.** Any value an item, lesson or checkpoint states about the Driftlight data is declared as an engine query and checked in a test, never typed by hand. Exam-format numbers come from `EXAM_FORMAT`.
- **Tableau editions**: the challenges target Tableau Desktop Public Edition. Where Public can't teach an objective, an optional step may use the free Desktop Free Edition. The exam itself assumes the paid Desktop.
- **Tableau facts are never written from memory.** Menu paths, defaults and the differences between Tableau Public and Desktop are checked against the docs. `PUBLIC_LIMITS` entries are `documented` (with a help.tableau.com source) or `unverified`.
- Draw the Tableau UI as schematic diagrams in our own style. Never use Tableau screenshots or copy its visual design. Don't redistribute Sample-Superstore: Superstore is mentioned in notes only.
- Write every question for this app. Never reproduce live exam content or third-party question dumps.
- The app is static: no backend, no accounts. Keep Vega-Lite and the engine lazy-loaded; keep content imports out of `src/app/routes.tsx` and `Layout`.
- `src/progress/store.ts` is the only module that touches `localStorage`. It is versioned: bump `VERSION`, add a migration in `load()` and keep the Zod `ProgressSchema` (used to validate imports) in step when the shape changes.
- Never use `Math.random` for content or samplers: use `src/data/rng.ts`.
- Use router `Link`s, never root-relative `<a href="/…">`: the app is served under `BASE_PATH`.

## Commands

```bash
npm run dev               # Vite dev server
npm run build             # tsc -b + production build
npm run lint              # oxlint (config: .oxlintrc.json)
npm run typecheck         # tsc -b (Vitest doesn't typecheck: run it before calling a change done)
npm test                  # Vitest, run once; npm run test:watch to watch
npx vitest run src/content/schema.test.ts   # single file; -t "<name>" for a single test
npm run data:generate     # regenerate public/data/ from the seed
npm run content:status    # items per task/objective vs. target, with the kind mix
npm run content:quality [-- <file.json> ...]  # anti-giveaway checks, per file or whole bank
npm run content:links     # fetch every cited URL (needs network; not part of npm test)
```

Tests run in Node by default; component tests start with `// @vitest-environment jsdom`. The `scripts/` run TypeScript directly in Node, so any `src/` module a script imports (and its imports) must use explicit `.ts` extensions.

## Where things are

Read the doc for the area you are changing before you change it:

- [`docs/engine.md`](docs/engine.md): `src/engine/` (the spec, data model, pills, calc language, query, renderer, spec edits, challenge matching, lazy runtime) and the Driftlight dataset in `src/data/`.
- [`docs/content.md`](docs/content.md): `src/content/`: the blueprint, the item schema and question bank, lessons, guides, calc exercises, flashcards and sandbox challenges, with the tests that check each.
- [`docs/app.md`](docs/app.md): the quiz, progress store, sandbox UI, simulators, pages and routes, checking a production build in a browser, and the GitHub Pages deploy.
