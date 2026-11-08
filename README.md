# GradeWise – Final Grade Calculator

An English-language Astro 7 calculator for required final scores, course-grade scenarios, test averages, component exams, points-based courses, dropped scores, and advanced weighted categories.

## Run locally

```sh
npm install
npm run dev
npm test
npm run build
```

Set `SITE_URL` to your deployed origin when building for production (for example, `SITE_URL=https://your-domain.example npm run build`). This sets the absolute canonical URL and generates `dist/sitemap.xml` and `dist/robots.txt`, with the sitemap referenced from robots.txt. A local build without `SITE_URL` checks the HTML and removes any previously generated sitemap and robots file so stale production URLs are not accidentally published.

## Grading assumptions

- Percentage calculations use only the values and weights students enter; no national grade conversion is assumed.
- Letter-grade and GPA displays require user-entered institution thresholds.
- In Tests & drops, existing test weights are relative to one another; the final test weight is its share of the whole course grade.
- In Exam components, component weights must total 100% of the final.
- In Advanced, assignment weights are relative within a category, category weights are course shares, and weighted category shares plus final/remaining work must total 100%. Blank scores count as remaining work, missing assignments count as zero, and equal-category mode gives each category an equal share. Extra-credit values are percentage points added once to their category average and are not multiplied by an assignment weight. Makeup scores count separately. Retakes count separately by default; optional replace, higher, or latest rules match a uniquely named original by assignment name within its category. For latest, the last matching retake row is treated as most recent.
- Advanced calculation functions accept each assignment as a percentage (`score`) or as earned and possible points (`pointsEarned`, `pointsPossible`); point totals are converted to a percentage before applying relative assignment weights.
- Recent calculations and grading preferences stay in browser local storage. Grade entries are not transmitted to a server.
