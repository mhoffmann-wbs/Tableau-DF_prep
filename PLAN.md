# Build Plan: Tableau-DF_prep

An interactive self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Trailhead Academy code Analytics-101).
The footer and README say: "Not affiliated with or endorsed by Salesforce, Inc. or Tableau. Tableau and Salesforce are trademarks of Salesforce, Inc."

Authoritative sources. Where they disagree with this plan, the sources win.
- Exam guide (Salesforce Help article 005298988): https://help.salesforce.com/s/articleView?id=005298988&type=1. The page is rendered with JavaScript, so automated fetches get an empty shell: read it in a browser. Its text was captured on 2026-11-23 and is the basis of §2 and §3.
- Certificate page: https://trailheadacademy.salesforce.com/certificate/exam-tableau-desktop-found---Analytics-101
- Tableau Desktop help: https://help.tableau.com/current/pro/desktop/en-us/default.htm. The exam tests **2022.3**, but Tableau doesn't keep version-specific help online (every `/v20xx.x/` path returns 404). Check whether a feature is newer than 2022.3 in the release notes: https://www.tableau.com/products/new-features

Recheck the guide's "Product Version" line before every content phase. If it moves past 2022.3, the version-sensitive notes in the lessons have to follow.

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Name | **Tableau-DF_prep**: `github.com/mhoffmann-wbs/Tableau-DF_prep` → `https://mhoffmann-wbs.github.io/Tableau-DF_prep/` |
| Audience | English-speaking **data bootcamp learners**: comfortable with spreadsheets and some SQL or Python, new or nearly new to Tableau. Lessons are brisk on general data concepts (joins, aggregation, data types), assume nothing about Tableau, and lean on SQL and pandas analogies where they help. |
| Theme | One invented streaming service, **Driftlight**, with its own generated dataset (§6a). All scenarios, charts, simulators and challenges use it. Places are real, so geographic roles work; every person, title and figure is invented. Lessons add a "Superstore note" wherever exam items are likely to assume Tableau's Sample-Superstore (Orders, People and Returns; Category › Sub-Category; Region; Profit Ratio). |
| Pillars | **Learn** (lessons), **Check** (practice, the question bank and the mock exam) and **Build**, which replaces a coding lab with four parts: the viz builder sandbox, the calc playground, the concept simulators and the Tableau Public challenges, plus flashcards (§7). |
| Granularity | One lesson per **task** (12). Every item carries a task id and the objective id(s) it tests, so coverage is checked per objective (56). |
| Item kinds | `single`, `multi`, and a third kind, `viz`, which is a single- or multi-select item whose stem includes a chart or a shelf setup drawn by the sandbox renderer (§4). |
| Bank size | About **600 items** (§4). |
| Mock exam | 40 items in 70 minutes, **all scored**, pass at 48%, split by domain weight. |
| Stack | Vite + React + TypeScript + Tailwind v4 + React Router + Zod + MDX + Vitest/RTL + oxlint, plus Vega-Lite for charts (lazy-loaded). The app is a static SPA with no backend. Progress lives in `localStorage` and can be exported and imported. |
| Tableau licence | Never needed for Learn or Check. The challenges mainly target the free **Tableau Desktop Public Edition** ("Tableau Public"). The exam assumes the paid Tableau Desktop, so where Public can't teach something (`PUBLIC_LIMITS`), an optional step may use the free **Tableau Desktop Free Edition** instead. Tableau's comparison page says it "can connect to all data sources" and needs no licence, but it can't save to Tableau Public. Anything only the paid Desktop can do is taught through lessons and simulators. |

## 2. Exam facts the app must mirror

| Fact | Value (guide) | App consequence |
|---|---|---|
| Items | 40 multiple-choice/multiple-select, plus up to 5 unscored that are randomly mixed in | The mock has 40 items, all scored, allocated by largest remainder: **9 · 15 · 10 · 6**. |
| Time | 70 minutes | Countdown, flag for review and a review screen. |
| Passing score | 48% (English version) | The report shows pass or fail at 48%, the percent correct, and the percent per domain and per task. The exam reports a plain percentage, so there's no scaled-score estimate. |
| Product version | 2022.3 | Lessons teach 2022.3 behaviour. Features added after 2022.3 are labelled "newer than the exam" or left out. Tableau Public runs a newer version, so the challenges point out the UI differences that matter. |
| Fee and retake | US$75; retake free | Shown in the exam-day guide. |
| Delivery | Proctored at a test centre or online; no reference materials allowed | Shown in the exam-day guide. |
| Prerequisite | None. The audience is described as having "a minimum of 3 months experience" | Shown on the home page. |
| Item style | MC/MR. Each multi-select item says how many to choose | `multi` stems say "(Choose 2 answers.)", and so on. |

The guide notes that the outline "is not a comprehensive listing". Lessons may touch adjacent basics (Show Me, the Marks card, worksheet vs. dashboard vs. story, Tableau file types), but questions stay tagged to an outline objective.

## 3. Blueprint → content map

`blueprint.ts` holds the domains, tasks and objectives **verbatim** from the guide. Task ids are `"2.3"` and objective ids are `"2.3.5"`, exactly as the guide numbers them.

| Domain | Weight | Mock | Tasks (objective count) |
|---|---|---|---|
| 1 Connecting to and Preparing Data | 23% | 9 | 1.1 Create live connections and extracts (5) · 1.2 Create and manage the data model (3) · 1.3 Manage data properties (5) |
| 2 Exploring and Analyzing Data | 37% | 15 | 2.1 Create basic charts (9) · 2.2 Organize data and apply filters (5) · 2.3 Apply analytics to a worksheet (7) |
| 3 Sharing Insights | 25% | 10 | 3.1 Format view for presentation (6) · 3.2 Create and modify a dashboard (5) · 3.3 View and share workbook data (3) |
| 4 Understanding Tableau Concepts | 15% | 6 | 4.1 Understand dimensions and measures (3) · 4.2 Understand discrete and continuous fields (3) · 4.3 Understand aggregations (2) |

The blueprint also holds:
- `EXAM_FORMAT` (§2), which the mock, the exam-day guide and the home page read.
- `questionTarget()` and `allocateMock()`, both largest-remainder splits (§4).
- A **feature map** listing which Build parts serve each objective (sandbox, calc, sim:<id>, challenge:<id>). Lessons use it to link their Build section, and `content:status` uses it to flag objectives with no hands-on support.
- `PUBLIC_LIMITS`: the objectives Tableau Desktop Public Edition can't do. Each entry is either `documented` (in Tableau's help, with a source) or `unverified` (still to be checked in Public). Don't add entries from memory.

## 4. Question bank

**Targets.** 600 items, split by domain weight (138 · 222 · 150 · 90) and then by each task's objective count:

| Task | 1.1 | 1.2 | 1.3 | 2.1 | 2.2 | 2.3 | 3.1 | 3.2 | 3.3 | 4.1 | 4.2 | 4.3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Items | 53 | 32 | 53 | 95 | 53 | 74 | 64 | 54 | 32 | 34 | 34 | 22 |

Every objective needs **at least 8** items. `questionTarget()` computes the targets and `npm run content:status` reports progress against them. Tests don't enforce the targets.

**Kinds.** A Zod discriminated union on `kind`. Every item shares `id` (`<taskId>-NNN`), `taskId`, `objectives[]`, `stem`, `options` (labelled A–F, never shuffled), `correct[]`, a rationale per option, `explanation` and optional `sourceLinks`.

| `kind` | What's shown | Grading |
|---|---|---|
| `single` | Pick 1 of 4. | exact |
| `multi` | Pick N of 5–6. The stem says how many. | all-or-nothing |
| `viz` | `single` or `multi`, plus a `viz` block: a sandbox spec (§7a) drawn as a chart, optionally with its shelves shown as pills (`show: "chart" \| "shelves" \| "both"`). Use it for "what does this view show?", "which change produces this chart?", "why is this axis green?" and "what happens to SUM(Minutes) if Genre is added to Rows?". | as `single`/`multi` |

Mix target: about 55% `single`, 25% `multi` and 20% `viz`. Objectives 2.1.x, 2.3.x, 4.2.x and 4.3.x lean on `viz`.

**Authoring rules.** Tests enforce the rules marked ✓.
- Stems use the exam's style: short and procedural ("A Driftlight analyst wants to… What should the analyst do?"), including menu-path and drag-target questions. There's one defensible answer, and the distractors are real Tableau actions that don't fit.
- ✓ For `single` items, no letter is the key in more than 40% of items, the key is the longest option in at most 40%, there are no duplicate stems, and explanations never mention option letters, so options can be reordered.
- ✓ For `multi`, `correct.length === select` and there are at least 5 options. Every `objectives[]` id belongs to the item's `taskId`.
- ✓ Every `viz` spec validates against the sandbox schema, references real fields, and renders without error in a test.
- ✓ **Numbers come from the data, not from memory.** A `viz` item or challenge checkpoint that states a value (the highest bar, a total, a count) declares it as a `check` query that the test evaluates against the dataset.
- Tableau behaviour (menu paths, defaults, what is or isn't possible) is checked against the Tableau help (and the release notes for anything that may be newer than 2022.3) and cited in `sourceLinks` when it isn't obvious.
- Every item is written for this app. Never reproduce live exam content (candidates accept the Certification Program Agreement) or third-party dumps.

## 5. Learn: lessons

There are 12 MDX lessons at `lessons/<taskId>.mdx`, with these sections in order:
1. `## Big idea`: what the task is for, in a few sentences, with a SQL or pandas analogy where one helps.
2. `## How it works`: one sub-heading per objective, giving the steps (menu paths, drag targets, right-click options) and what Tableau shows. Live `<Viz>` embeds from the sandbox renderer illustrate it. Draw the UI as schematic diagrams in our own style, never as Tableau screenshots.
3. `## At Driftlight`: the task applied to the dataset, with "Open in sandbox" links.
4. `## Exam traps`: easily confused pairs, such as join vs. relationship vs. blend, group vs. set, dimension vs. discrete, extract vs. live, the context filter, quick table calc vs. calculated field, combined axis vs. dual axis, and "Superstore notes".
5. `## Build`: links from the blueprint feature map to the matching sandbox presets, calc exercises, simulators, challenges and flashcards.

`meta`: `taskId`, `updated`, `tldr`, `objectivesCovered` (a test checks that the lesson covers every objective of its task) and `links` to help.tableau.com.

Lesson order follows how people learn, not the domain numbers: **4 → 1 → 2 → 3**. The concepts come first because everything else depends on them. The home page lists lessons in this order, and the blueprint view keeps guide order.

## 6. Data

### 6a. The Driftlight dataset
`scripts/generate-data.ts` generates it deterministically from a fixed seed. It writes CSVs (and one `.xlsx`) to `public/data/` for download into Tableau Public, plus compact JSON for the in-app engine. The tables are designed to exercise the outline:

| File | Rows (approx.) | Teaches |
|---|---|---|
| `subscribers.csv`: Subscriber ID, Signup Date, Plan Code, Country, State/Province, City, Postal Code, Latitude, Longitude, Age Band, Channel | 3,000 | geographic roles (1.3.3), maps and density maps (2.1.4, 2.1.8), a postal code read as a number (change the data type, 1.3.4), Plan Code aliases (1.3.2) |
| `plans.csv`: Plan Code, Plan, Monthly Price, Screens, Ad Supported (Boolean) | 4 | joins (1.2.2), Boolean fields |
| `titles.csv`: Title ID, Title, Type, Genre, Sub-Genre, Release Year, Rating, Runtime, Original | 400 | hierarchies such as Type › Genre › Sub-Genre (2.2.3), groups (2.2.1), sets (2.2.2) |
| `sessions_2024.csv`, `sessions_2025.csv`: Session ID, Subscriber ID, Title ID, Start (datetime), Minutes Watched, Device, Completed | about 15k each | unions (1.2.2), dates as parts vs. values (4.2.3), the main measures |
| `cancellations.csv`: Subscriber ID, Cancel Date, Reason | about 400 | left joins and nulls (the Returns-style table) |
| `regions.csv`: Country, Region, Regional Manager | about 25 | the People-style lookup |
| `targets.xlsx`: Region, Month, Target Subscribers, Target Hours | 24 per region | a data source with multiple connections (1.1.5); relationships at a different level of detail (1.2.1, 1.2.3) |

Built-in data quirks for the preparation lessons include a date column stored as text in one file, codes that need aliases, a few nulls (for ZN and IFNULL), and inconsistent city spellings to group.

### 6b. In-app engine (`src/engine/`)
This is the core shared by the sandbox, the `viz` items, lesson embeds, simulators and challenge checks:
- `model.ts`: tables, fields (role: dimension or measure; type: string, number, date, datetime, Boolean, geographic; default aggregation; aliases; default format), and the Driftlight data model, with relationships and the joins that a spec may switch on.
- `query.ts`: evaluates a spec into an aggregated result. It handles the level of detail from the dimensions in the view, aggregations (SUM, AVG, MIN, MAX, COUNT, COUNTD, MEDIAN, ATTR), date parts (discrete) vs. date truncations (continuous), filters (dimension, measure, date range and relative date, and later context filters), groups, sets, bins, sort, and later quick table calculations and totals.
- `calc/`: the tokenizer, parser and evaluator for the calc subset (§7b), shared with the playground.
- `render.ts`: spec + result → Vega-Lite spec. Blue (discrete) fields become headers or panes, green (continuous) fields become axes, and the Marks card channels map to encodings. The mark type follows Tableau's Automatic rules. Lazy-loaded, never in the initial bundle.

Tests compare query results with independent computations over the raw rows, for example a plain reduce in the test.

## 7. Build: the hands-on replacement

### 7a. Viz builder sandbox (`/build/sandbox`)
A schematic Tableau-style workspace (not a visual copy):
- a **Data pane** with dimensions above measures, each field with a type icon, and right-click actions to rename, alias, change the data type, assign a geographic role, change default properties, create a group, set, hierarchy or bin, convert to discrete or continuous, and convert to dimension or measure
- the **Columns**, **Rows** and **Filters** shelves, and a **Marks** card (mark type; Color, Size, Label, Detail, Tooltip, Shape)
- **pills** coloured blue or green, with an aggregation menu, a date part vs. date value menu and sort options
- a view that redraws on every change
- the spec serialised to the URL (`#spec=`), so lessons, items and the bank can open a preset

v1 is the core shelves. Later phases add quick table calcs, totals, reference lines, dual or combined axis, calculated fields from the playground, and a simple dashboard with a filter action (§9).

**Challenges in the sandbox:** "make this chart" tasks show a target picture and check the learner's spec against a set of accepted specs. Each challenge is tagged with objectives. Completions are saved in progress but don't count towards readiness.

### 7b. Calc playground (`/build/calc`)
A small editor for a documented subset of Tableau's calculation language, with the result as a table over the dataset (row-level) or per dimension (aggregate):
- operators (`+ - * / %`, comparisons, `AND OR NOT`, `+` to join strings), `IF/ELSEIF/ELSE/END`, `IIF`, `CASE/WHEN`
- functions: string (`LEFT RIGHT MID LEN UPPER LOWER TRIM CONTAINS STARTSWITH REPLACE SPLIT`), date (`DATEPART DATENAME DATETRUNC DATEADD DATEDIFF MAKEDATE TODAY`, where TODAY is pinned to a fixed date), number (`ROUND ABS ZN`), null handling (`IFNULL ISNULL`), type conversion (`STR INT FLOAT DATE`), aggregate (`SUM AVG MIN MAX COUNT COUNTD ATTR`)
- Tableau's real error behaviour for the subset, especially **"Cannot mix aggregate and non-aggregate arguments"**, with an explanation and a link to the right lesson
- exercises (`calc/<taskId>.json`: a prompt, the field names to use, `expected` = a reference calc whose output the learner's calc must match, and hints) checked by comparing outputs over the dataset
- saved calcs that become fields in the sandbox

LOD expressions and table-calc functions are out of scope: the outline only asks for quick table calcs (2.3.3) and simple calculated fields (2.3.5).

### 7c. Concept simulators (`/build/sim/:simId`)
Components with their copy as data. Each ends with 2–3 bank items.

| Sim | What the learner does | Objectives |
|---|---|---|
| Data model lab | Combines two small tables as an inner, left, right or full join, a union, a relationship or a blend, and watches the row counts and SUMs. Join duplication inflates a measure; a relationship doesn't. | 1.2.1–1.2.3, 1.1.5 |
| Live vs. extract | Switches between connection types and sees query timing, freshness, filters on extracts, aggregation to visible dimensions, and incremental refresh. Shows the files involved: `.twb`, `.twbx`, `.tds`, `.tdsx`, `.hyper`. | 1.1.1–1.1.4, 3.3.1 |
| Granularity slider | Adds and removes dimensions in a view of SUM(Minutes) and watches the marks split and the aggregate change. | 4.3.1, 4.3.2, 4.1.x |
| Blue vs. green | Toggles a field between discrete and continuous on each shelf, and a date between parts and values, and sees headers become axes. | 4.2.1–4.2.3 |
| Filter order | Places filters (extract, data source, context, dimension, measure, table calc) and sees which rows survive at each stage, including the Top N with and without context case. | 2.2.4, 2.2.5 |
| Group, set or hierarchy? | Sorts scenarios into group, set, hierarchy, bin or parameter, then sees each one built in the sandbox. | 2.2.1–2.2.3, 2.3.4, 2.3.6 |
| Dashboard actions | Wires a filter, highlight, URL or parameter action between two canned sheets and tries it. | 3.2.2, 3.2.3 |

### 7d. Tableau Public challenges (`/build/challenges/:id`)
About 12 MDX challenges, roughly one per task, in Tableau Public with the downloaded Driftlight files. A few optional steps use Desktop Free Edition (§1). Each has:
- `meta.steps`, a checklist stored in progress (don't rename step ids), and `meta.checkpoints`, numeric or text answers the learner reads from their own viz ("Total minutes watched on Mobile in Q3 2025?"). The `check` query in the engine computes each answer, and a test verifies them.
- sections `## Goal`, `## Get the data`, `## Steps`, `## Checkpoints` and `## Exam angle`, plus a `> Public vs. Desktop` callout wherever the steps differ from Desktop or from 2022.3.
- a mark on any step Public can't do. Such a step is either an optional **Desktop Free Edition** step (with a `meta.steps` flag `edition: "free"`, so it never blocks completion), or, if only the paid Desktop can do it, a pointer to the simulator that covers it. Check what Free Edition supports in Tableau's help before relying on it.

Challenges never count towards readiness.

### 7e. Flashcards (`/build/flashcards`)
Leitner boxes 0–5 rated Again, Good or Easy, with intervals of 0, 1, 3, 7, 16 and 35 days. A session shows due cards first, then new ones. There are about 250 built-in cards (`flashcards/<taskId>.json`): terms, menu paths, file types, chart recipes ("dual axis = …") and blue/green rules. Learners can make their own decks and share them as validated JSON files. Review state is never shared.

## 8. App features

- A versioned `localStorage` progress store with export and import. It records item stats with a streak, mock results, lessons read, flashcard state, own decks, sandbox and calc challenge completions, saved calcs, and challenge checklists and checkpoints.
- Readiness per task, calculated as coverage × accuracy and weighted by domain weight. `masteryOf()` returns one of: not tested, recent error, past error since correct, always correct.
- Practice by task, by domain, by weighted mix, by least mastered or by weak spots. Each practice session ends with a review.
- A question bank browser with task, kind and mastery filters.
- Keyboard shortcuts.
- All pages are lazy-loaded, and Vega-Lite and the engine load only where they're needed.
- Print-ready guides: a cheat sheet (chart recipes, the blue/green and dimension/measure rules, the filter order, file types) and an exam-day guide (facts from `EXAM_FORMAT`).
- Tooling: content tests, `content:status` (items per task and objective against target, the kind mix, objectives with no Build support), `content:quality` (the anti-giveaway checks), `content:links` (every cited URL) and `data:generate`.

## 9. Phases

0. **Scaffold** (done 2026-11-23): set up the tooling and the Pages deploy, and add the non-affiliation footer. Write `blueprint.ts` (verbatim from the guide) and the item schema, the content tests, the dataset generator and the Driftlight CSVs. `PUBLIC_LIMITS` records 1.1.1 and 3.3.1 as documented limits. **Open:** check the three `unverified` entries (1.1.4 `.tds`, 1.1.5 CSV + Excel connections, 3.3.3 PowerPoint) in Tableau Public before writing phase 8's challenges.
1. **Engine**: the model, the query layer and the Vega-Lite renderer, with tests against raw-row computations, and a `<Viz>` component.
2. **Quiz engine**: render and grade `single`, `multi` and `viz` items; practice, the question bank and the mock (40 items, 70 minutes, pass at 48%, per-domain report); readiness; session review; shortcuts.
3. **Sandbox v1**: the Data pane, shelves, the Marks card, pills, URL specs and "make this chart" challenges.
4. **Lessons**: 12 lessons in learning order (4, 1, 2, 3), embedding live vizzes and sandbox presets.
5. **Question bank**: about 600 items, written per task file, with `single` and `multi` first, then `viz`.
6. **Calc playground**: the parser and evaluator, the error messages, exercises, and saved calcs in the sandbox.
7. **Simulators and flashcards**.
8. **Sandbox v2, challenges and guides**: quick table calcs, totals, reference lines, dual or combined axis and a simple dashboard in the sandbox; the Tableau Public challenges; the cheat sheet and exam-day guide; a mobile pass; accessibility for the sandbox (keyboard alternatives to dragging pills).
