# Tableau-DF prep

A free self-study web app for the **Salesforce Certified Tableau Desktop Foundations** exam (Analytics-101): lessons for every task in the exam guide, practice questions in the exam's style, a timed 40-item mock exam, and hands-on tools — a viz builder, a calculated-field playground, concept simulators and challenges you build in Tableau Public.

All examples use **Driftlight**, an invented streaming service. Its dataset (subscribers, plans, titles, viewing sessions, cancellations, regions and targets) is generated from a fixed seed and can be downloaded from `public/data/` to use in Tableau.

Live site: https://mhoffmann-wbs.github.io/Tableau-DF_prep/

## Development

```bash
npm install
npm run dev            # dev server
npm test               # tests
npm run lint
npm run build          # production build
npm run data:generate  # regenerate the Driftlight files
```

See `PLAN.md` for the build plan.

---

Not affiliated with or endorsed by Salesforce, Inc. or Tableau. Tableau and Salesforce are trademarks of Salesforce, Inc. Driftlight, its people, titles and figures are invented.
