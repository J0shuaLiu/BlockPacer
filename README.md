# Block Pacer

A static site that tells CMU students how many meal blocks and how much FLEX to spend
each week so their dining plan finishes with nothing left to expire.

## Run it

It is plain HTML, CSS and JavaScript with no build step.

```sh
open index.html          # macOS
# or serve it
npx serve .
```

Deploy by copying `index.html`, `styles.css` and `app.js` to any static host
(GitHub Pages, Netlify, Cloudflare Pages).

## What it does

- Presets for every 2026–27 plan (Green, Blue, Red, Yellow, Tartan Flex, Scotty's Choice,
  Whitfield's Favor, Piper Select) plus a custom option.
- Counts only the days you are actually on campus: pick how long you are away for
  Fall Break, Thanksgiving or Spring Break, and set the day you leave after finals.
- Shows blocks and FLEX per day and per week, a pace verdict based on what you have
  used so far, a burn-down chart, and a week-by-week table whose targets add up exactly
  to your remaining balance.
- Enforces the 4-blocks-a-day cap and warns when blocks cannot be saved.
- Before the Sep 18, 2026 change deadline it projects which plan fits your real pace.
- Everything stays in `localStorage`; nothing is sent anywhere.

## Data sources

- [2026–27 First-Year Dining Plan Agreement](https://www.cmu.edu/dining/your-dining-plan/26-27-fy-meal-plan-agreement.pdf)
- [2026–27 Upperclassmen Dining Plan Agreement](https://www.cmu.edu/dining/your-dining-plan/26-27-uc-meal-plan-agreementfinal.pdf)
- [2026–27 Official Academic Calendar](https://www.cmu.edu/hub/calendar/docs/2627-academic-calendar.pdf)

Plan numbers and dates live at the top of `app.js` (`PLANS` and `SEMESTERS`);
update them there when a new agreement is published.
