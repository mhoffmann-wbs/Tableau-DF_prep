# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phases 0–1 are done: the scaffold, the blueprint, the item schema, the content tests and scripts, the Driftlight dataset, and the chart engine. The app has a home page showing the exam format and outline, plus an unlisted `/dev/charts` gallery. **`PLAN.md` is the build plan and sets the order of work.** It records the decisions made, the blueprint → content map, the item kinds, the dataset, the Build pillar and the phases. As parts get built, update this file so it describes what exists, and mark phases done in `PLAN.md` §9 with the date.

## Purpose

**Tableau-DF_prep** is a self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Analytics-101). It is written in English for data bootcamp learners who know spreadsheets and some SQL or Python but little or no Tableau. It has three pillars:
- **Learn**: one lesson per task (12).
- **Check**: practice, the question bank and a mock exam of 40 items in 70 minutes, passing at 48%.
- **Build**: a Tableau-style viz builder sandbox, a calculated-field playground, concept simulators, Tableau Public challenges and flashcards. These replace a coding lab, because the exam has no hands-on items.

Every scenario uses one invented streaming service, **Driftlight**, and its generated dataset.

## Authoritative sources

- Exam guide: https://help.salesforce.com/s/articleView?id=005298988&type=1. It's the single source of truth for domains, weights, tasks, objectives and exam format. The page is rendered with JavaScript, so WebFetch returns an empty shell: ask the user to paste the current text. When it changes, update `src/content/blueprint.ts` first. The content tests then show what has to follow.
- The exam tests **Tableau 2022.3**, but only the current help is online (https://help.tableau.com/current/pro/desktop/en-us/default.htm; versioned `/v20xx.x/` paths return 404). Before teaching a feature as exam material, check in the release notes (https://www.tableau.com/products/new-features) that it existed in 2022.3.
- The footer and README say "Not affiliated with or endorsed by Salesforce, Inc. or Tableau."

## Rules that span the codebase

- **Content is data.** Lessons, questions, calc exercises, challenges and flashcards are files under `src/content/`, validated with Zod and rendered generically. To add content, add data, not a component. The exception is the simulators, which are components, though their copy is data.
- **One engine.** `src/engine/` (data model, query layer, calc evaluator, Vega-Lite renderer) is shared by the sandbox, `viz` items, lesson embeds, simulators and challenge checkpoints. Don't build a second chart path.
- **Numbers come from the data.** Any value an item, lesson or checkpoint states about the Driftlight data is declared as an engine query and checked in a test, never typed by hand.
- **Tableau editions**: the challenges target Tableau Desktop Public Edition. Where Public can't teach an objective, an optional step may use the free Desktop Free Edition. The exam itself assumes the paid Desktop.
- **Tableau facts are never written from memory.** Menu paths, defaults and the differences between Tableau Public and Desktop are checked against the docs. `PUBLIC_LIMITS` entries are `documented` (with a help.tableau.com source) or `unverified`.
- Draw the Tableau UI as schematic diagrams in our own style. Never use Tableau screenshots or copy its visual design. Don't redistribute Sample-Superstore: Superstore is mentioned in notes only.
- Write every question for this app. Never reproduce live exam content or third-party question dumps.
- The app is static: no backend, no accounts. Keep Vega-Lite and the engine lazy-loaded.
- `src/progress/store.ts` (planned) is meant to be the only module that touches `localStorage`. It will be versioned: bump `VERSION`, add a migration and keep the Zod `ProgressSchema` in step when the shape changes.

## Commands

```bash
npm run dev               # Vite dev server
npm run build             # tsc -b + production build
npm run lint              # oxlint (config: .oxlintrc.json)
npm run typecheck         # tsc -b
npm test                  # Vitest, run once; npm run test:watch to watch
npx vitest run src/content/schema.test.ts   # single file; -t "<name>" for a single test
npm run data:generate     # regenerate public/data/ from the seed
npm run content:status    # items per task/objective vs. target, with the kind mix
npm run content:quality [-- <file.json> ...]  # anti-giveaway checks, per file or whole bank
npm run content:links     # fetch every cited URL (needs network; not part of npm test)
```

Tests run in Node by default. Component tests start with `// @vitest-environment jsdom`. Vitest runs without globals, so `src/test/setup.ts` registers Testing Library's `cleanup`.

The `scripts/` run TypeScript directly in Node (native type stripping). So any `src/` module a script imports, and that module's own imports, must use explicit `.ts` extensions (`allowImportingTsExtensions` is on). The data modules and `content/schema.ts`/`quality.ts` already do.

To check a production build in a browser, run `BASE_PATH=/Tableau-DF_prep/ npm run build`, then `BASE_PATH=/Tableau-DF_prep/ npx vite preview`. Preview also reads `base` from `BASE_PATH`; without it, asset requests under the sub-path fall back to `index.html` and the page stays blank. Headless Chrome needs `--virtual-time-budget=30000` to wait for the lazy pages and the dataset.

GitHub Pages serves the app under `/Tableau-DF_prep/`. `.github/workflows/deploy.yml` runs lint, the tests and `BASE_PATH=/Tableau-DF_prep/ npm run build`, copies `index.html` to `404.html` so deep links work, and deploys on push to `main`. Vite's `base` and the router's `basename` come from `BASE_PATH`, so use router `Link`s, never root-relative `<a href="/…">`.

## Layout

- `src/content/blueprint.ts`: `EXAM_FORMAT` (format facts from the guide), `DOMAINS`, `TASKS` with their objectives **verbatim** (ids `"2.3"` and `"2.3.5"`, as the guide numbers them), `LESSON_ORDER` (concepts first: 4, 1, 2, 3), `largestRemainder`, `allocateMock()` (9 · 15 · 10 · 6), `TARGETS`/`questionTarget()` (600 items split by domain weight, then by objective count; at least `MIN_PER_OBJECTIVE` = 8), and `PUBLIC_LIMITS`.
- `src/content/schema.ts`: the Zod item union. All kinds share `id` (`<taskId>-NNN`), `taskId`, `objectives[]` (all under `taskId`), `stem`, `options` (`text`, `correct`, `rationale`), `explanation` and optional `sourceLinks`:
  - `single`: exactly 4 options.
  - `multi`: `select` 2–3, 5–6 options.
  - `viz`: `select` 1–3, 4–6 options, plus `viz: {spec, show: chart|shelves|both}`.

  Multi-select stems must contain exactly `(Choose N answers.)`, and single-answer stems must not. `selectCount()` gives N.
- `src/content/questions/<taskId>.json`: one JSON array per task (empty so far), loaded by `bank.ts` (`ITEMS`, `QUESTION_FILES`). `bank.test.ts` checks file/task match, objectives, unique ids and the `quality.ts` checks. The checks cover single-answer items (`single`, and `viz` with `select` 1):
  - no key letter in more than 40% of items
  - the key is the strictly longest option in at most 40%
  - no duplicate stems (stem + viz spec)
  - explanations and rationales never cite option letters, so options can be reordered
- **Engine** (`src/engine/`). Engine modules import each other with `.ts` extensions, so scripts can use them.
  - `spec.ts`: the viz spec.
    - `source` is `sessions` (default), `subscribers` or `titles`.
    - `columns`/`rows` hold pills. The Marks card has `type`, `color`, `size`, `label`, `shape`, `detail[]` and `tooltip[]`.
    - `filters`: `values` (members by display string, optionally `exclude`), `range` (row-level, or a measure filter after aggregation when `agg` is set), `dateRange` and `datePart` (canonical numbers).
    - A pill is `{field, agg?, date?: {level, mode: part|value}, as?: discrete|continuous, sort?: {order, field?+agg? (computed), manual?}}`. `weekday` can only be a part.
  - `model.ts`: the field metadata (the dataset after preparation: Postal Code is a geo string, Release Year a discrete dimension, and Latitude/Longitude are measures with an AVG default) and `SOURCE_INFO` (fields in Data pane order, a `<Source> (Count)` measure, and `Latitude/Longitude (generated)`).
    - `buildDataset(csvTexts)` builds three flattened sources. Each base table is left-joined many-to-one to its lookups, so rows never multiply, and unmatched lookups become nulls. Sessions get titles, subscribers, plans and regions; subscribers get plans, regions and cancellations.
    - Values are typed: dates are UTC epoch ms and empty cells are null. `loadDataset()` fetches `public/data/` once in the browser.
  - `pills.ts`: `resolvePill` decides dimension or measure, blue or green, and the Tableau label (`SUM(…)`, `CNTD(…)`, `MONTH(…)`). It throws `EngineError`, which carries learner-facing messages.
    - Date dimensions default to the YEAR part.
    - Aggregated numbers and COUNT/COUNTD are continuous, and MIN/MAX/ATTR of non-numbers are discrete.
  - `query.ts` (`query(spec, dataset)`) runs: row filters → one group per combination of the view's dimension members → aggregation → measure filters → member order. Results are `{columns, rows}`, keyed `c0, c1…`.
    - Discrete members are display strings (`Q3`, `January`, `Null`, `True`). Continuous dates are epoch ms.
    - Each discrete column carries its member `order`: the natural order (date parts chronologically, strings alphabetically, Null last), a computed sort, or a manual one.
    - Generated coordinates come from the finest geographic dimension in the view, using `data/geography.ts`.
    - `columnOf(result, source, pill)` reads a pill's column. Use it in tests and checkpoints instead of assuming column order, because columns follow `pillsOf` order: Columns, Rows, then the Marks card.
  - `render.ts` (`toVegaLite`):
    - The innermost pill on a shelf becomes the axis (continuous) or the band (discrete). The discrete pills before it become facet panes, several joined with " · ". Only one continuous pill per shelf for now.
    - `automaticMark` follows Tableau's Automatic: geo → circle, nothing continuous → text ("Abc" without a label), a continuous date → line, measure × measure → circle, otherwise bar.
    - `square` on two discrete shelves becomes a highlight-table `rect`. `density` uses translucent circles. `map` draws a filled country map via a lookup on world-atlas ISO ids; lat/long marks draw on an `equalEarth` world.
    - Band width comes from the longest label. Charts take colours from a `Theme`. `needsWorld(spec)` says whether to load the topology.
  - `runtime.ts`: a lazy chunk with the dataset, query, vega-embed and world-atlas. `Viz.tsx` imports it on first draw, keys its state by the spec's JSON, and shows `EngineError` messages. `Shelves.tsx` and `PillChip` show a spec's shelves read-only and need no data.
  - Tests: `src/test/dataset.ts` gives `testDataset()` (the committed CSVs) and `referenceData()` (the generator's typed rows, the independent reference). `query.test.ts` checks the engine against plain reductions over the reference. `render.test.ts` compiles every chart type with Vega-Lite and renders it to SVG in Node (`new View(parse(compile(vl).spec), {renderer: 'none'}).toSVG()`).
  - `src/pages/ChartGalleryPage.tsx` (`/dev/charts`, not in the nav) shows each basic chart type from the outline with its shelves. Use it to check rendering in a browser.
- **Dataset** (`src/data/`):
  - `generate.ts` builds the Driftlight dataset from `SEED`: 3,000 subscribers, 4 plans, 400 titles, 15k sessions in 2024 and 17k in 2025, about 400 cancellations, 25 countries in 5 regions, and monthly targets by region. It returns the file contents plus the typed rows.
  - `scripts/generate-data.ts` writes the files to `public/data/` (committed, served for download). Changing the generator moves every number the content cites.
  - `data.test.ts` fails if the committed files differ byte for byte from the generator. It also checks consistency (sessions only by active subscribers, of released titles) and the deliberate quirks:
    - ZIP codes with a leading zero
    - city spelling variants (München/Munich, Köln, Sao Paulo, Bogota)
    - a few null `Minutes Watched` and blank `Device` values
    - union-compatible session files
  - `xlsx.ts` is a minimal deterministic `.xlsx` writer (fflate, fixed local-time mtime) for `targets.xlsx`. Monthly dates are stored as real Excel dates.
  - `rng.ts` holds `seededRng` (mulberry32), `pick`, `weighted` and `randInt`. Never use `Math.random` for content or samplers.
- `src/data/geography.ts`: the regions, countries (with ISO numeric ids for world-atlas) and cities with coordinates. Both the generator and the engine use it.
- `src/app/`: `routes.tsx` (every page lazy-loaded; keep content imports out of it and `Layout`) and `Layout.tsx` (nav, a phone Menu button, the non-affiliation footer). `src/pages/`: `HomePage` (format and outline). `pages.test.tsx` renders real routes with `createMemoryRouter` and an async `renderAt()`.
- Theme tokens (`src/index.css`, `@theme`): `brand`, `brand-dark`, `accent`, `chalk`, `page`, `header`, and the pill colours `discrete` (blue) and `continuous` (green). Dark mode follows the OS by remapping the tokens and the slate scale once, so components don't use `dark:` variants.
