# Build Plan: Tableau-DF_prep

An interactive self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Trailhead Academy code Analytics-101).
The footer and README say: "Not affiliated with or endorsed by Salesforce, Inc. or Tableau. Tableau and Salesforce are trademarks of Salesforce, Inc."

Authoritative sources. Where they disagree with this plan, the sources win.
- Exam guide (Salesforce Help article 005298988): https://help.salesforce.com/s/articleView?id=005298988&type=1. Rendered with JavaScript, so read it in a browser. Its text was captured on 2026-11-23 and is the basis of §2 and §3.
- Certificate page: https://trailheadacademy.salesforce.com/certificate/exam-tableau-desktop-found---Analytics-101
- Tableau Desktop help: https://help.tableau.com/current/pro/desktop/en-us/default.htm. The exam tests **2022.3**, but only the current help is online; check whether a feature is newer than 2022.3 in the release notes: https://www.tableau.com/products/new-features

Recheck the guide's "Product Version" line before every content phase. If it moves past 2022.3, the version-sensitive notes in the lessons have to follow.

How the built parts work is in `docs/` (engine, content, app). This plan keeps the decisions, the rules content must follow, the remaining work and the open checks (§10).

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Name | **Tableau-DF_prep**: `github.com/mhoffmann-wbs/Tableau-DF_prep` → `https://mhoffmann-wbs.github.io/Tableau-DF_prep/` |
| Audience | English-speaking **data bootcamp learners**: comfortable with spreadsheets and some SQL or Python, new to Tableau. Brisk on general data concepts, nothing assumed about Tableau, SQL and pandas analogies where they help. |
| Theme | One invented streaming service, **Driftlight**, with its own generated dataset (§6a). Places are real, so geographic roles work; every person, title and figure is invented. Lessons add a "Superstore note" wherever exam items are likely to assume Sample-Superstore. |
| Pillars | **Learn** (lessons), **Check** (practice, bank, mock) and **Build** (sandbox, calc playground, simulators, Tableau Public challenges, flashcards) (§7). |
| Granularity | One lesson per **task** (12). Every item carries a task id and objective id(s); coverage is checked per objective (56). |
| Item kinds | `single`, `multi`, `viz` (§4). |
| Bank size | About **600 items** (§4). |
| Mock exam | 40 items in 70 minutes, **all scored**, pass at 48%, split by domain weight. |
| Stack | Vite + React + TypeScript + Tailwind v4 + React Router + Zod + MDX + Vitest/RTL + oxlint, plus lazy-loaded Vega-Lite. Static SPA; progress in `localStorage` with export and import. |
| Tableau licence | Never needed for Learn or Check. Challenges target **Tableau Desktop Public Edition**; where Public can't teach something (`PUBLIC_LIMITS`), an optional step may use the free **Desktop Free Edition** (connects to all data sources, can't save to Tableau Public). Paid-Desktop-only features are taught through lessons and simulators. |

## 2. Exam facts the app must mirror

| Fact | Value (guide) | App consequence |
|---|---|---|
| Items | 40 MC/MR, plus up to 5 unscored mixed in | Mock: 40 scored items, largest remainder **9 · 15 · 10 · 6**. |
| Time | 70 minutes | Countdown, flag for review, review screen. |
| Passing score | 48% (English version) | Pass/fail at 48%, percent per domain and task; no scaled score. |
| Product version | 2022.3 | Lessons teach 2022.3; newer features are labelled or left out. Challenges note where Tableau Public's newer UI differs. |
| Fee and retake | US$75; retake free | Exam-day guide. |
| Delivery | Test centre or online proctored; no reference materials | Exam-day guide. |
| Prerequisite | None; "a minimum of 3 months experience" | Home page. |
| Item style | MC/MR; multi-select says how many | `multi` stems say "(Choose 2 answers.)". |

The outline "is not a comprehensive listing": lessons may touch adjacent basics, but questions stay tagged to an outline objective.

## 3. Blueprint → content map

`blueprint.ts` holds the domains, tasks and objectives **verbatim** from the guide (task ids `"2.3"`, objective ids `"2.3.5"`).

| Domain | Weight | Mock | Tasks (objective count) |
|---|---|---|---|
| 1 Connecting to and Preparing Data | 23% | 9 | 1.1 Create live connections and extracts (5) · 1.2 Create and manage the data model (3) · 1.3 Manage data properties (5) |
| 2 Exploring and Analyzing Data | 37% | 15 | 2.1 Create basic charts (9) · 2.2 Organize data and apply filters (5) · 2.3 Apply analytics to a worksheet (7) |
| 3 Sharing Insights | 25% | 10 | 3.1 Format view for presentation (6) · 3.2 Create and modify a dashboard (5) · 3.3 View and share workbook data (3) |
| 4 Understanding Tableau Concepts | 15% | 6 | 4.1 Understand dimensions and measures (3) · 4.2 Understand discrete and continuous fields (3) · 4.3 Understand aggregations (2) |

It also holds `EXAM_FORMAT` (§2), `questionTarget()` and `allocateMock()` (largest-remainder splits), the **feature map** (Build parts per objective) and `PUBLIC_LIMITS` (objectives Public can't do, each `documented` with a source or `unverified`; never added from memory).

## 4. Question bank

**Targets.** 600 items by domain weight (138 · 222 · 150 · 90), then by objective count; at least 8 per objective. `content:status` reports progress; tests don't enforce the targets.

| Task | 1.1 | 1.2 | 1.3 | 2.1 | 2.2 | 2.3 | 3.1 | 3.2 | 3.3 | 4.1 | 4.2 | 4.3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Items | 53 | 32 | 53 | 95 | 53 | 74 | 64 | 54 | 32 | 34 | 34 | 22 |

**Kinds.** `single` (1 of 4, exact), `multi` (N of 5–6, stem says N, all-or-nothing), `viz` (`single`/`multi` plus a sandbox spec drawn as a chart and/or shelves). Mix target: about 55 / 25 / 20%.

**Authoring rules** (✓ = enforced by tests):
- Exam-style stems: short, procedural, one defensible answer, distractors that are real Tableau actions.
- ✓ `single`: no letter is the key in more than 40% of items, the key is the longest option in at most 40%, no duplicate stems, explanations never cite option letters.
- ✓ `multi`: `correct.length === select`, at least 5 options; every objective belongs to the item's task.
- ✓ Every `viz` spec validates, references real fields and renders.
- ✓ **Numbers come from the data**: any stated Driftlight value is declared in `checks` and recomputed.
- Tableau behaviour is checked against the help (and release notes) and cited in `sourceLinks` when not obvious.
- Every item is written for this app; never live exam content or third-party dumps.

## 5. Learn: lessons

12 MDX lessons (`lessons/<taskId>.mdx`): `## Big idea`, `## How it works` (one sub-heading per objective), `## At Driftlight`, `## Exam traps`, `## Build`. Learning order **4 → 1 → 2 → 3**; the blueprint view keeps guide order. UI is drawn as our own schematics, never screenshots.

## 6. Data

### 6a. The Driftlight dataset
Generated deterministically from a seed (`npm run data:generate`) into CSVs and one `.xlsx` in `public/data/`, plus JSON for the engine. Each table exists to teach part of the outline:

| File | Teaches |
|---|---|
| `subscribers.csv` (3,000) | geographic roles (1.3.3), maps (2.1.4, 2.1.8), postal code as number (1.3.4), Plan Code aliases (1.3.2) |
| `plans.csv` (4) | joins (1.2.2), Boolean fields |
| `titles.csv` (400) | hierarchies (2.2.3), groups (2.2.1), sets (2.2.2) |
| `sessions_2024.csv`, `sessions_2025.csv` | unions (1.2.2), date parts vs. values (4.2.3), the main measures |
| `cancellations.csv` | left joins and nulls |
| `regions.csv` | the People-style lookup |
| `targets.xlsx` | multiple connections (1.1.5), relationships at another level of detail (1.2.1, 1.2.3) |

Built-in quirks: a date stored as text, codes needing aliases, nulls (ZN, IFNULL), inconsistent city spellings.

### 6b. In-app engine (`src/engine/`)
One engine (model, query, calc, Vega-Lite renderer) shared by the sandbox, `viz` items, lesson embeds, simulators and challenge checks; query results are tested against raw-row computations. See `docs/engine.md`.

## 7. Build: the hands-on replacement

### 7a. Viz builder sandbox (`/build/sandbox`)
A schematic Tableau-style workspace (not a visual copy): Data pane, Filters/Columns/Rows shelves, Marks card, blue/green pills with menus, the spec in `#spec=`. "Make this chart" challenges check the learner's spec with `engine/match.ts`; they don't count towards readiness. Remaining features: phase 8.4–8.6 and 8.10.

### 7b. Calc playground (`/build/calc`)
A documented subset of Tableau's calculation language: operators, `IF/IIF/CASE`, string, date (`TODAY` pinned), number, null, type-conversion and aggregate functions, with Tableau's "Cannot mix aggregate and non-aggregate arguments" error. Exercises compare outputs with a reference calc; saved calcs become sandbox fields. LOD expressions and table-calc functions are out of scope (the outline asks only for quick table calcs, 2.3.3, and simple calculated fields, 2.3.5).

### 7c. Concept simulators (`/build/sim/:simId`)
Components with their copy as data, each ending with 2–3 bank items: Data model lab (1.2.x, 1.1.5), Live vs. extract (1.1.1–1.1.4, 3.3.1), Granularity slider (4.3.x, 4.1.x), Blue vs. green (4.2.x), Filter order (2.2.4, 2.2.5), Group, set or hierarchy? (2.2.1–2.2.3, 2.3.4, 2.3.6), Dashboard actions (3.2.2, 3.2.3).

### 7d. Tableau Public challenges (`/build/challenges/:id`)
About 12 MDX challenges, roughly one per task, in Tableau Public with the downloaded Driftlight files. A few optional steps use Desktop Free Edition (§1). Each has:
- `meta.steps`, a checklist stored in progress (don't rename step ids), and `meta.checkpoints`, numeric or text answers the learner reads from their own viz ("Total minutes watched on Mobile in Q3 2025?"). The `check` query in the engine computes each answer, and a test verifies them.
- sections `## Goal`, `## Get the data`, `## Steps`, `## Checkpoints` and `## Exam angle`, plus a `> Public vs. Desktop` callout wherever the steps differ from Desktop or from 2022.3.
- a mark on any step Public can't do. Such a step is either an optional **Desktop Free Edition** step (with a `meta.steps` flag `edition: "free"`, so it never blocks completion), or, if only the paid Desktop can do it, a pointer to the simulator that covers it. Check what Free Edition supports in Tableau's help before relying on it.

Challenges never count towards readiness.

### 7e. Flashcards (`/build/flashcards`)
Leitner boxes 0–5 (Again, Good, Easy; intervals 0, 1, 3, 7, 16, 35 days), due cards first. Built-in cards per task; own decks shared as validated JSON, review state never shared.

## 8. App features

Versioned progress store with export/import; readiness per task (coverage × accuracy, domain-weighted); practice modes with review; bank browser; keyboard shortcuts; lazy-loaded pages, Vega-Lite and engine; print-ready guides (§9, 8.9); content tooling (`content:status`, `content:quality`, `content:links`, `data:generate`). See `docs/app.md`.

## 9. Phases

0. **Scaffold** (done 2026-11-23): tooling, Pages deploy, footer, `blueprint.ts`, item schema, content tests, dataset generator.
1. **Engine** (done 2026-11-23): model, query, renderer, `<Viz>`, `<Shelves>`, `/dev/charts` gallery.
2. **Quiz engine** (done 2026-11-23): the three item kinds, practice, bank, mock, readiness, review, shortcuts.
3. **Sandbox v1** (done 2026-11-23): shelves, Marks card, filters, pills with menus, drag and drop with menu alternatives, `#spec=` with Undo, 15 "make this chart" challenges.
4. **Lessons** (done 2026-11-23): 12 lessons with live charts, sandbox presets and data facts checked by a test.
5. **Question bank** (done 2026-11-24): 600 items (346 `single`, 153 `multi`, 101 `viz`; `viz` at 17% until the sandbox can draw 2.1.5–2.1.6 and 2.3.2–2.3.7).
6. **Calc playground** (done 2026-11-24): `engine/calc/`, calcs in the spec everywhere in the engine, `/build/calc`, 17 exercises.
7. **Simulators and flashcards** (done 2026-11-24): 7 simulators, 287 flashcards, own decks.
8. **Sandbox v2, challenges and guides**, one substep at a time:
   1. **Field properties** (done 2026-11-24): rename, aliases, data type, geographic role, conversions, Default Properties; manual sorts.
   2. **Groups, sets, hierarchies and bins** (done 2026-11-24): from the Data pane and from selected marks; hierarchy drill.
   3. **Axes** (done 2026-11-24): Automatic mark per the help; measure panes, combined axis (Measure Names/Values), dual and synchronized axes, mark type per measure.
   4. **Quick table calcs and totals**: running total, difference, percent difference, percent of total, rank, moving average…, with Compute Using; row and column totals and grand totals.
   5. **Reference lines** from an Analytics pane (line, band, distribution scopes by table, pane and cell).
   6. **Simple dashboard**: two sheets with a filter action.
   7. **Content on the new features**: `viz` items for 2.1.5–2.1.6 and 2.3.2–2.3.7, new sandbox challenges, lesson charts that replace the text-only parts, and the Group/set/hierarchy simulator building in the sandbox. First make `match.ts` compare `mark`, `axes` and the Measure Values card.
   8. **Tableau Public challenges** (§7d). Needs the three `unverified` `PUBLIC_LIMITS` checked in Tableau Public first.
   9. **Cheat sheet and exam-day guide** (done 2026-11-24): `/guides`, facts restated from the lessons and `EXAM_FORMAT`. Recheck the cheat sheet whenever a lesson is corrected.
   10. **Mobile pass and sandbox accessibility** (keyboard alternatives to dragging pills).

## 10. Open checks

Facts to verify in Tableau (not settled by the help) and known limits, from finished phases. Remove an entry when it's resolved.

**Check in Tableau Public / Desktop**
- `PUBLIC_LIMITS` `unverified`: 1.1.4 `.tds`, 1.1.5 CSV + Excel connections, 3.3.3 PowerPoint (before 8.8).
- Menu path for hiding and showing a legend (3.1.6); lesson 3.1 states none.
- Default Color (palette) for measures: lesson 1.3 says Color is for dimensions only; fix it if Tableau offers it, and add default Color/Shape to the sandbox.
- Recheck lesson menu labels against 2022.3 when an install is available (the help is the current version).
- Calc behaviour the evaluator guesses (noted in `functions.ts`; no exercise depends on it): ROUND on halves, integer `/`, DATEPART('weekday') for Sunday, SPLIT with a missing token, CONTAINS case on extracts, DATEADD at month ends. The IF/CASE variant of the mixing error was seen only on a blog, so the playground shows the function message.
- Filter order sim: which stage a range-of-dates filter belongs to.
- Dashboard actions sim: what "Exclude all values" and "Set value to" do.
- "Convert to Measure" (only "Convert to Dimension" is documented; the sandbox offers it only as an undo).
- What a manual data type change does to values (sandbox offers no Boolean/number → date, and text → date only in ISO form); whether a "None" geographic role exists.
- Display-unit names "Thousands (K)" / "Millions (M)".
- Default names of groups, sets and hierarchies, and a group's name from its members.
- How Measure Names members are named; Automatic mark for a continuous dimension against a measure (sandbox draws Circle).

**Known limits** (fix when the area is next touched)
- Engine: filled maps for countries only; density marks approximated with translucent circles.
- Sandbox: headers can't be selected (groups from headers go through the Data pane); selected marks aren't highlighted; groups, sets and bins can't be used in or built on calcs; no Combined Sets; dynamic sets ignore context filters (none yet); axis drops are menu items, not drag targets; only one shelf holds several measures and a dual axis takes exactly two; the per-measure Marks card sets only the mark type.
- Simulators leave out Go to Sheet, Change Set Values, Viz in Tooltip, Show/Hide buttons, relative-date filters and extract row-limit options.
