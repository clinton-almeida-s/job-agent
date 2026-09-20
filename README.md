# Job Agent — Daily GCP / Cloud Job Scraper

A lightweight Node.js agent that scrapes remote GCP / Cloud / Platform Engineering jobs from multiple boards and produces a ranked HTML report with optional AI cover letters.

## Sources
- RemoteOK, Remotive, We Work Remotely (working public feeds)
- Shine (Indian board), LinkedIn (soft RSS attempt + optional cookie-based)

## Usage

```bash
node main.js              # full run (scrape → rank → cover letters → report)
node main.js --no-ai      # skip Claude cover letters
node main.js --open       # open HTML report after generation
```

## Environment Variables
- `ANTHROPIC_API_KEY` — for Claude cover letters
- `LINKEDIN_COOKIES` — optional session cookies for LinkedIn scraping (use at own risk)

## Schedule
Runs daily at 2:30 AM UTC (8:00 AM IST) via `.github/workflows/daily-jobs.yml`.

## Why the schedule triggered early today
The workflow uses `cron: '30 2 * * *'` (UTC). If GitHub's runners had a delay or the previous run queued, it can trigger at an unexpected IST time. To make it stricter and avoid delays, consider:
- Adding `timeout-minutes: 15` to fail fast
- Changing cron to `0 2 * * *` for a cleaner start
- Not changing to earlier — the delay was likely a queue/backfill issue, not a timing error

Built by Claude Code.
Co-Authored-By: Claude Code <noreply@anthropic.com>
