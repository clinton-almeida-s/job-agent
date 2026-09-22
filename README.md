# Job Agent — Daily GCP / Cloud Job Scraper

A lightweight Node.js agent that searches GCP / Cloud / Platform Engineering roles across multiple job boards, ranks them against your profile, generates tailored cover letters (optional, via Claude), and produces a clean HTML report.

**Target:** Mumbai-based or remote roles with salary ₹35 LPA+.

## What it does
1. Scrapes active sources: RemoteOK, Remotive, We Work Remotely, Shine (India), LinkedIn (optional cookie-based), and more.
2. Filters out already-seen listings and deal-breakers (sales, temporary, on-site only, etc.).
3. Scores each job by title, keywords, remote status, recency, and profile match.
4. Generates AI cover letters if `ANTHROPIC_API_KEY` is set.
5. Outputs an HTML report (`output/report-*.html`) that can be emailed or opened in a browser.

## How to use it

```bash
# Full run (scrape → rank → cover letters → HTML report)
node main.js

# Skip AI cover letters (faster, no API key needed)
node main.js --no-ai

# Auto-open the HTML report in your browser after generation
node main.js --open

# Optional: enable LinkedIn cookie-based scraping (advanced, may violate ToS)
LINKEDIN_COOKIES='<session-cookies>' node main.js
```

## Requirements
- Node.js 22+
- `ANTHROPIC_API_KEY` (only for cover letters; the agent runs fine without it — use `--no-ai`)
- `LINKEDIN_COOKIES` (optional, for enhanced LinkedIn results)
- GitHub Actions (for daily scheduling) — see `.github/workflows/daily-jobs.yml`

## Schedule
Runs at `2:00 AM UTC` (8:30 AM IST) daily. A 15-minute timeout prevents runaway runs.

Note: the workflow triggers via `cron`. Any occasional time shift is a GitHub runner-queue effect, not a schedule error. Changing the cron earlier does not prevent queue delays.

## Sources included
- RemoteOK (JSON API)
- Remotive (JSON API)
- We Work Remotely (RSS, browser UA)
- Shine (Indian board, lightweight page scraping)
- LinkedIn (optional cookie-based attempt + soft RSS fallback)

Removed/dead sources: Remote-Python, Startup.jobs, Remote-io, WorkRemoteLy, Indeed (no public feed).

## Setup in your repo
1. Clone this repo
2. Copy `profile.json` and update your keywords, titles, and resume path
3. Set `ANTHROPIC_API_KEY` in your environment or GitHub secrets for cover letters
4. Run `npm install`
5. Trigger manually: `node main.js --no-ai`

## LinkedIn Cookie Setup (for Mumbai jobs)
To get Mumbai-specific results from LinkedIn:

1. Open LinkedIn in your browser while logged in
2. Open DevTools (F12) → Network tab
3. Refresh the page, click on any request to `linkedin.com`
4. Go to **Headers** → **Request Headers** → find `cookie:`
5. Copy the entire cookie string value
6. Set it as an environment variable:
   ```bash
   # Windows (PowerShell)
   $env:LINKEDIN_COOKIES = 'your-cookie-string-here'
   node main.js --no-ai
   ```
7. For GitHub Actions: add `LINKEDIN_COOKIES` as a secret and add to the workflow env section

> Note: LinkedIn cookies expire after a few days. Update periodically for best results.

## Indian Job Sources
Most major Indian job sites (Naukri, Indeed India, Instahyre, Wellfound) block automated access with 403 errors. The code includes placeholder functions that gracefully handle this. For Mumbai-specific results:
- Set up LinkedIn cookie scraping above
- Manually check Naukri.com / Indeed India for roles matching your profile
