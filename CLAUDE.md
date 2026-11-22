# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Nothing is built yet: the repo holds only this file and `PLAN.md`. **`PLAN.md` is the build plan and sets the order of work.** It records the decisions made, the blueprint → content map, the item kinds, the dataset, the Build pillar and the phases. As parts get built, replace the planned notes below with what actually exists (commands, file layout, gotchas), and mark phases done in `PLAN.md` §9 with the date.

## Purpose

**Tableau-DF_prep** is a self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Analytics-101). It is written in English for data bootcamp learners who know spreadsheets and some SQL or Python but little or no Tableau. It has three pillars:
- **Learn**: one lesson per task (12).
- **Check**: practice, the question bank and a mock exam of 40 items in 70 minutes, passing at 48%.
- **Build**: a Tableau-style viz builder sandbox, a calculated-field playground, concept simulators, Tableau Public challenges and flashcards. These replace a coding lab, because the exam has no hands-on items.

Every scenario uses one invented streaming service, **Driftlight**, and its generated dataset (`PLAN.md` §6a).

## Authoritative sources

- Exam guide: https://help.salesforce.com/s/articleView?id=005298988&type=1. It's the single source of truth for domains, weights, tasks, objectives and exam format. The page is rendered with JavaScript, so WebFetch returns an empty shell: ask the user to paste the current text. When it changes, update `src/content/blueprint.ts` first. The content tests then show what has to follow.
- The exam tests **Tableau 2022.3**. Check Tableau behaviour against the 2022.3 help (https://help.tableau.com/v2022.3/pro/desktop/en-us/default.htm), not against the newest version.
- The footer and README say "Not affiliated with or endorsed by Salesforce, Inc. or Tableau."

## Rules that span the codebase

- **Content is data.** Lessons, questions, calc exercises, challenges and flashcards are files under `src/content/`, validated with Zod and rendered generically. To add content, add data, not a component. The exception is the simulators, which are components, though their copy is data.
- **One engine.** `src/engine/` (data model, query layer, calc evaluator, Vega-Lite renderer) is shared by the sandbox, `viz` items, lesson embeds, simulators and challenge checkpoints. Don't build a second chart path.
- **Numbers come from the data.** Any value an item, lesson or checkpoint states about the Driftlight data is declared as an engine query and checked in a test, never typed by hand. The dataset is generated from a fixed seed, so regenerating it with a changed generator can move every number.
- **Tableau facts are never written from memory.** Menu paths, defaults and the differences between Tableau Public and Desktop are checked against the docs, or in Public itself for the `publicLimits` list.
- Draw the Tableau UI as schematic diagrams in our own style. Never use Tableau screenshots or copy its visual design. Don't redistribute Sample-Superstore: Superstore is mentioned in notes only.
- Write every question for this app. Never reproduce live exam content or third-party question dumps.
- The app is static: no backend, no accounts. Vega-Lite and the engine are lazy-loaded.
- `src/progress/store.ts` is meant to be the only module that touches `localStorage`. It is versioned: bump `VERSION`, add a migration and keep the Zod `ProgressSchema` in step when the shape changes.

## Commands (planned, phase 0)

```bash
npm run dev               # Vite dev server
npm run build             # tsc -b + production build (BASE_PATH=/Tableau-DF_prep/ for Pages)
npm run lint              # oxlint
npm test                  # Vitest, run once
npx vitest run <file>     # single test file; -t "<name>" for a single test
npm run data:generate     # regenerate the Driftlight CSVs and engine JSON from the seed
npm run content:status    # items per task/objective vs. target, kind mix, objectives without Build support
npm run content:quality   # anti-giveaway checks
npm run content:links     # fetch every cited URL (needs network)
```

GitHub Pages serves the app under `/Tableau-DF_prep/`: Vite's `base` and the router's `basename` come from `BASE_PATH`, and the deploy copies `index.html` to `404.html` so deep links work.
