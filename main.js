/**
 * main.js — Job Agent entry point
 *
 * Usage:
 *   node main.js           # run the agent (scrape → rank → cover letters → report)
 *   node main.js --no-ai   # skip cover letter generation (faster, no API key needed)
 *   node main.js --open    # auto-open the HTML report in your browser after generation
 */

const { execSync }          = require('child_process');
const path                  = require('path');
const { scrapeAllSources }  = require('./src/scraper');
const { rankJobs }          = require('./src/ranker');
const { generateCoverLetter } = require('./src/coverLetter');
const { markSeen, filterNew, stats } = require('./src/tracker');
const { saveReport }        = require('./src/reporter');
const profile               = require('./profile.json');

const args   = process.argv.slice(2);
const NO_AI  = args.includes('--no-ai');
const OPEN   = args.includes('--open');
const TOP_N  = 30; // Show top 30

async function run() {
  console.log('\n🔎 Job Agent starting —', new Date().toLocaleString());
  console.log(`   Searching for: ${profile.target_titles.slice(0, 4).join(', ')} ...\n`);

  // 1. Scrape all sources
  console.log('📡 Scraping job boards...');
  let allJobs;
  try {
    allJobs = await scrapeAllSources(profile.required_keywords);
  } catch (e) {
    console.error('Scraping failed:', e.message);
    process.exit(1);
  }
  console.log(`   Found ${allJobs.length} raw listings\n`);

  // 2. Filter out already-seen jobs
  const newJobs = filterNew(allJobs);
  console.log(`   ${newJobs.length} new (unseen) listings\n`);

  // 3. Rank and pick top N
  console.log(`📊 Ranking jobs against your profile...`);
  const topJobs = rankJobs(newJobs, TOP_N);
  console.log(`   Top ${topJobs.length} selected\n`);

  if (topJobs.length === 0) {
    console.log('✨ No new matching jobs found today. Try again tomorrow!');
    const reportPath = saveReport([], stats());
    console.log(`\n📄 Report saved: ${reportPath}`);
    return;
  }

  // 4. Mark all top jobs as seen
  topJobs.forEach(j => markSeen(j.id));

  // 5. Generate cover letters (optional — requires ANTHROPIC_API_KEY)
  if (NO_AI) {
    console.log('✋ Skipping cover letter generation (--no-ai flag)\n');
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ℹ️  No ANTHROPIC_API_KEY set — skipping cover letter generation');
    console.log('   Set it to get tailored cover letters per job\n');
  } else {
    console.log('✍️  Generating cover letters with Claude...');
    for (let i = 0; i < topJobs.length; i++) {
      const job = topJobs[i];
      process.stdout.write(`   [${i + 1}/${topJobs.length}] ${job.title} @ ${job.company}...`);
      try {
        job.cover_letter = await generateCoverLetter(job);
        console.log(' ✅');
      } catch (e) {
        console.log(` ⚠️ (${e.message})`);
      }
      // small delay to avoid rate limiting
      if (i < topJobs.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    console.log();
  }

  // 6. Print summary to console
  console.log('━'.repeat(60));
  console.log(`🏆 TOP ${topJobs.length} JOBS FOR YOU TODAY:`);
  console.log('━'.repeat(60));
  topJobs.forEach((j, i) => {
    console.log(`\n${i + 1}. ${j.title} — ${j.company}`);
    console.log(`   Score: ${j.score} pts | Source: ${j.source}`);
    console.log(`   ${j.url}`);
    j.match_reasons.forEach(r => console.log(`   ✅ ${r}`));
  });
  console.log('\n' + '━'.repeat(60));

  // 7. Save HTML report
  const reportPath = saveReport(topJobs, stats());
  console.log(`\n📄 Full report saved: ${reportPath}`);

  // 8. Open in browser if requested
  if (OPEN) {
    console.log('🌐 Opening in browser...');
    try {
      execSync(`start "" "${reportPath}"`, { stdio: 'ignore' });
    } catch {
      console.log('   (Could not auto-open — open the file manually)');
    }
  } else {
    console.log('   Run with --open to auto-launch in your browser');
  }

  console.log('\n✨ Done! Review the report and click "Apply Now" for roles you like.\n');
}

run().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  process.exit(1);
});
