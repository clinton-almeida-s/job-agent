/**
 * Job Scraper — fetches listings from multiple job boards
 * Sources: RemoteOK, We Work Remotely, Remotive, LinkedIn RSS, Naukri, Indeed India
 */

const https = require('https');
const http  = require('http');

// Lightweight bespoke XML RSS parser (no dependencies needed)
function parseRssXml(xml) {
  const items = [];
  // Regex to extract <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    // Helper to extract tag contents
    const extract = (tag) => {
      // Need a dynamic regex for the tag, so we build it
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
      const m = itemXml.match(r);
      if (!m) return '';
      // Strip CDATA wrapper if present
      let content = m[1].trim();
      if (content.startsWith('<![CDATA[')) {
        content = content.replace(/^<!\[CDATA\[(.*)\]\]>$/s, '$1');
      }
      return content;
    };

    items.push({
      title: extract('title'),
      link: extract('link'),
      description: extract('description'),
      pubDate: extract('pubDate'),
      'wwr:company_name': extract('wwr:company_name'),
      source: extract('source'),
      'georss:point': extract('georss:point')
    });
  }

  return {
    rss: {
      channel: {
        item: items
      }
    }
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fetch(url, ua = 'JobAgent/1.0 (personal job search bot)', cookies = '') {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const headers = { 'User-Agent': ua };
    if (cookies) headers['Cookie'] = cookies;
    client.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function parseXML(xml) {
  // Use our bespoke parser instead of xml2js to avoid npm installs
  return Promise.resolve(parseRssXml(xml));
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── sources ──────────────────────────────────────────────────────────────────

/**
 * RemoteOK JSON API — free, no auth required
 * Docs: https://remoteok.com/api
 */
async function scrapeRemoteOK(keywords) {
  console.log('  Fetching RemoteOK...');
  try {
    const { status, body } = await fetch('https://remoteok.com/api');
    if (status !== 200) return [];
    const jobs = JSON.parse(body).filter(j => j.position); // first item is metadata
    return jobs.map(j => ({
      id:          `remoteok-${j.id}`,
      source:      'RemoteOK',
      title:       j.position || '',
      company:     j.company  || '',
      location:    'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        (j.tags || []).join(', '),
      salary:      j.salary  || '',
      url:         j.url     || `https://remoteok.com/remote-jobs/${j.slug}`,
      posted_at:   j.date    || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  RemoteOK error: ${e.message}`);
    return [];
  }
}

/**
 * Remote Python Jobs — focused on Python/DevOps/ML roles
 * https://remote-python.com
 */
async function scrapeRemotePython(keyword) {
  console.log('  Fetching Remote-Python...');
  try {
    const { status, body } = await fetch('https://remote-python.com/jobs-rss.xml');
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    // Filter for cloud/ops related
    return list.slice(0, 50).map((j, i) => ({
      id:          `rpy-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'Remote-Python',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['job:company'] || ''),
      location:    'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      cleanText(j['job:salary'] || ''),
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    })).filter(j => {
      const t = (j.title + j.description).toLowerCase();
      return t.includes('cloud') || t.includes('gcp') || t.includes('devops') || t.includes('kubernetes') || t.includes('aws') || t.includes('azure') || t.includes('data') || t.includes('engineer');
    });
  } catch (e) {
    console.warn(`  Remote-Python error: ${e.message}`);
    return [];
  }
}

/**
 * Startup.jobs — tech startup jobs
 */
async function scrapeStartupJobs(keyword) {
  console.log('  Fetching Startup.jobs...');
  try {
    const { status, body } = await fetch('https://startup.jobs/rss');
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 50).map((j, i) => ({
      id:          `startup-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'Startup.jobs',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['jobboard:company'] || ''),
      location:    cleanText(j['job:location'] || 'Remote'),
      remote:      (j['job:location'] || '').toLowerCase().includes('remote'),
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  Startup.jobs error: ${e.message}`);
    return [];
  }
}

/**
 * Remote OK (alternative endpoint)
 */
async function scrapeRemoteIO(keyword) {
  console.log('  Fetching Remote-io...');
  try {
    const { status, body } = await fetch('https://remote.io/remote-jobs.rss');
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 50).map((j, i) => ({
      id:          `remoteio-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'Remote.io',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['job:company'] || ''),
      location:    'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  Remote.io error: ${e.message}`);
    return [];
  }
}

/**
 * WorkRemoteLy — curated remote jobs
 */
async function scrapeWorkRemoteLy(keyword) {
  console.log('  Fetching WorkRemoteLy...');
  try {
    const { status, body } = await fetch('https://workremote.ly/feed');
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 50).map((j, i) => ({
      id:          `wrl-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'WorkRemoteLy',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['job:company'] || ''),
      location:    'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  WorkRemoteLy error: ${e.message}`);
    return [];
  }
}

/**
 * We Work Remotely RSS — free
 */
async function scrapeWeWorkRemotely(keyword) {
  console.log('  Fetching We Work Remotely...');
  try {
    const url = `https://weworkremotely.com/remote-jobs.rss`;
    const { status, body } = await fetch(url, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((j, i) => ({
      id:          `wwr-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'WeWorkRemotely',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['wwr:company_name'] || ''),
      location:    'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  WWR error: ${e.message}`);
    return [];
  }
}

/**
 * Remotive API — free JSON
 * Docs: https://remotive.com/api/remote-jobs
 */
async function scrapeRemotive(keyword) {
  console.log('  Fetching Remotive...');
  try {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=50`;
    const { status, body } = await fetch(url);
    if (status !== 200) return [];
    const { jobs } = JSON.parse(body);
    return (jobs || []).map(j => ({
      id:          `remotive-${j.id}`,
      source:      'Remotive',
      title:       j.title       || '',
      company:     j.company_name|| '',
      location:    j.candidate_required_location || 'Remote',
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        (j.tags || []).join(', '),
      salary:      j.salary      || '',
      url:         j.url         || '',
      posted_at:   j.publication_date || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  Remotive error: ${e.message}`);
    return [];
  }
}

/**
 * Shine — Indian job board (lightweight page scraping)
 * Note: Shine now blocks automated access; kept for future use
 */
async function scrapeShine(keyword) {
  console.log('  Fetching Shine...');
  // Shine blocks automated scraping; return empty for now
  return [];
}

/**
 * LinkedIn Cookie-based (needs user cookies from browser session)
 * To use: export LINKEDIN_COOKIES from your browser session
 * See README for setup instructions
 */
async function scrapeLinkedInCookie(keyword) {
  console.log('  Fetching LinkedIn (cookie-based)...');
  try {
    const cookieStr = process.env.LINKEDIN_COOKIES || '';
    if (!cookieStr || cookieStr.length < 20) {
      console.log('     (LinkedIn cookie not set — set LINKEDIN_COOKIES env var to enable. See README for setup.)');
      return [];
    }
    const encoded = encodeURIComponent(keyword);
    // Search for Mumbai jobs with various filters
    const urls = [
      `https://www.linkedin.com/jobs/search?keywords=${encoded}&location=Mumbai&f_JT=F&sortBy=DD`,
      `https://www.linkedin.com/jobs/search?keywords=${encoded}&location=Mumbai&f_WT=2&f_JT=F&sortBy=DD`,
    ];

    for (const url of urls) {
      const { status, body } = await fetch(url, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', cookieStr);
      if (status !== 200) continue;

      // Extract job listings from JSON-LD script tags
      const jobs = [];
      const jsonLdMatches = body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
      for (const match of jsonLdMatches) {
        try {
          const json = JSON.parse(match[1]);
          if (json['@graph'] && Array.isArray(json['@graph'])) {
            json['@graph'].forEach(item => {
              if (item['@type'] === 'JobPosting' && item.jobTitle) {
                jobs.push({
                  id: `linkedin-json-${Buffer.from(item.url || item.jobTitle).toString('base64').slice(0, 16)}`,
                  source: 'LinkedIn',
                  title: item.jobTitle || '',
                  company: item.hiringOrganization?.name || '',
                  location: item.workplaceLocation?.address || 'Mumbai, India',
                  remote: item.jobLocationType === 'REMOTE',
                  description: cleanText(item.description || ''),
                  tags: (item.skills || '').join(', '),
                  salary: item.baseSalary?.value?.minValue ? `$${item.baseSalary.value.minValue}` : '',
                  url: item.url || '',
                  posted_at: new Date(item.datePosted || Date.now()).toISOString(),
                });
              }
            });
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // Fallback: regex extraction
      if (jobs.length === 0) {
        const titleRe = /<a[^>]*href="([^"]*linkedin\.com\/jobs\/view[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = titleRe.exec(body)) !== null) {
          const jobUrl = m[1].startsWith('http') ? m[1] : `https://www.linkedin.com${m[1]}`;
          const title = cleanText(m[2]).slice(0, 120);
          if (title && title.length > 3 && !title.toLowerCase().includes('cookie') && !title.toLowerCase().includes('privacy')) {
            jobs.push({
              id: `linkedin-regex-${Buffer.from(jobUrl).toString('base64').slice(0, 16)}`,
              source: 'LinkedIn',
              title: title,
              company: '',
              location: 'Mumbai, India',
              remote: false,
              description: '',
              tags: '',
              salary: '',
              url: jobUrl,
              posted_at: new Date().toISOString(),
            });
          }
        }
      }

      if (jobs.length > 0) {
        console.log(`     Found ${jobs.length} jobs`);
        return jobs.slice(0, 30);
      }
    }
    return [];
  } catch (e) {
    console.warn(`  LinkedIn cookie error: ${e.message}`);
    return [];
  }
}

/**
 * LinkedIn RSS (public, no auth — limited fields)
 * Note: LinkedIn blocks heavy scraping; RSS is a soft approach
 */
async function scrapeLinkedInRSS(keyword) {
  console.log('  Fetching LinkedIn RSS...');
  try {
    const encoded = encodeURIComponent(keyword);
    // f_WT=2 = remote jobs filter
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encoded}&f_WT=2&f_JT=F&sortBy=DD&format=rss`;
    const { status, body } = await fetch(url);
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 30).map((j, i) => ({
      id:          `linkedin-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'LinkedIn',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['source'] || ''),
      location:    cleanText(j['georss:point'] || 'Remote'),
      remote:      true,
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  LinkedIn RSS error: ${e.message}`);
    return [];
  }
}

/**
 * Naukri.com RSS — free Indian job board
 * Note: Naukri blocks direct RSS access; requires authentication
 * Using alternative approach via job search pages
 */
async function scrapeNaukri(keyword) {
  console.log('  Fetching Naukri...');
  // Naukri RSS is blocked; skip for now
  return [];
}

/**
 * Indeed India RSS — free Indian job board
 * Note: Indeed blocks RSS from scripts; using LinkedIn instead for Mumbai
 */
async function scrapeIndeedIndia(keyword) {
  console.log('  Fetching Indeed India...');
  // Indeed blocks direct access; skip for now
  return [];
}

/**
 * LinkedIn - Mumbai jobs RSS (specific location)
 */
async function scrapeLinkedInMumbai(keyword) {
  console.log('  Fetching LinkedIn Mumbai RSS...');
  try {
    const encoded = encodeURIComponent(keyword);
    // f_WT=2 = remote, f_CC=105847 = Mumbai, f_WFH=3 = hybrid
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encoded}&f_CC=105847&f_JT=F&sortBy=DD&format=rss`;
    const { status, body } = await fetch(url);
    if (status !== 200) return [];
    const parsed = await parseXML(body);
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 30).map((j, i) => ({
      id:          `linkedin-mumbai-${Buffer.from(j.link || i.toString()).toString('base64').slice(0, 16)}`,
      source:      'LinkedIn-Mumbai',
      title:       cleanText(j.title || ''),
      company:     cleanText(j['source'] || ''),
      location:    'Mumbai, India',
      remote:      false,  // Default to on-site for Mumbai
      description: cleanText(j.description || ''),
      tags:        '',
      salary:      '',
      url:         j.link || '',
      posted_at:   j.pubDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`  LinkedIn Mumbai RSS error: ${e.message}`);
    return [];
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse salary string and return min value in INR
 * Handles: ₹35 LPA, $120k, $90-105k, hourly rates, etc.
 */
function parseSalaryMin(salaryStr) {
  if (!salaryStr) return 0;
  const s = salaryStr.trim();

  // Convert lakhs (L, LPA) to numeric
  const inrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:LPA|L\s*PA|Lakhs?)/i);
  if (inrMatch) {
    return parseFloat(inrMatch[1]) * 100000; // Convert to actual INR value
  }
  // Handle ranges like "₹30-50 LPA"
  const rangeMatch = s.match(/(\d+)[\s-]*(\d+)\s*L/i);
  if (rangeMatch) {
    return parseFloat(rangeMatch[1]) * 100000;
  }

  // Check for hourly rate
  const isHourly = s.toLowerCase().includes('/hour') || s.toLowerCase().includes('per hour');
  if (isHourly) {
    const hourlyMatch = s.match(/\$(\d+)/i);
    if (hourlyMatch) {
      const hourly = parseInt(hourlyMatch[1]);
      // Annualize: hourly * 2080 (40hrs * 52weeks)
      const annualUsd = hourly * 2080;
      return annualUsd * 83; // Convert to INR
    }
  }

  // Handle USD values like "$120k" or "$90k - $105k" or "$120 - $170"
  const usdMatch = s.match(/\$(\d+)(?:k)?/i);
  if (usdMatch) {
    const usdStr = usdMatch[1];
    const isK = s.toLowerCase().includes('k');
    let usdValue;

    if (isK) {
      // e.g., $90k = $90,000
      usdValue = parseInt(usdStr) * 1000;
    } else if (/\d{3,}/.test(usdStr)) {
      // e.g., $120 = $120,000 (assume thousands for 3+ digit numbers)
      usdValue = parseInt(usdStr) * 1000;
    } else {
      // e.g., $90 = $90/hour (handled above) or small annual salary
      usdValue = parseInt(usdStr) * 1000; // Assume thousands
    }
    return usdValue * 83; // Convert to INR
  }

  // Handle plain numbers (assume lakhs if small)
  const plainMatch = s.match(/(\d+)/);
  if (plainMatch) {
    const num = parseFloat(plainMatch[1]);
    if (num < 100) return num * 100000; // Assume lakhs
    return num;
  }
  return 0;
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Scrapes all sources for a list of keywords.
 * Returns deduplicated array of job objects.
 */
async function scrapeAllSources(keywords) {
  const primaryKeyword = keywords[0]; // e.g. "GCP Engineer"

  // Consolidated search terms - each term is fetched once, results are later deduped
  const remoteOkKeywords = keywords;
  const remotiveTerms    = ['GCP', 'Google Cloud', 'BigQuery', 'Cloud Migration', 'Data Migration', 'Platform Engineer', 'Cloud Architect', 'Cloud Engineer'];
  const weWorkTerms      = ['GCP', 'Google Cloud', 'Cloud Migration', 'Platform Engineer', 'Cloud Architect'];
  const shineTerms       = ['GCP Engineer', 'Cloud Architect', 'Platform Engineer', 'Google Cloud'];
  const mumbaiTerms      = ['GCP Engineer', 'Cloud Architect', 'Platform Engineer', 'Google Cloud'];
  // Note: Indian job sites (Naukri, Shine, Indeed) block direct RSS/API access.
  // For Mumbai jobs, use LinkedIn cookie-based scraping (see LINKEDIN_COOKIES env var).

  const results = await Promise.allSettled([
    scrapeRemoteOK(remoteOkKeywords),
    // Remotive — working JSON API (fetched once per term, deduped later)
    ...remotiveTerms.map(term => scrapeRemotive(term)),
    // We Work Remotely — fixed URL + browser UA (fetched once per term, deduped later)
    ...weWorkTerms.map(term => scrapeWeWorkRemotely(term)),
    // LinkedIn — cookie attempt (needs LINKEDIN_COOKIES env), soft RSS fallback
    scrapeLinkedInCookie('GCP Engineer'),
    scrapeLinkedInCookie('Cloud Architect'),
    scrapeLinkedInRSS('GCP Engineer'),
    // Indian job boards — Shine, Naukri, Indeed
    ...shineTerms.map(term => scrapeShine(term)),
    // Mumbai hybrid jobs via LinkedIn (more reliable than Naukri/Indeed RSS)
    ...mumbaiTerms.map(term => scrapeLinkedInMumbai(term)),
    // Removed broken/dead sources: Remote-Python, Startup.jobs, Remote-io, WorkRemoteLy,
    // LinkedIn Mumbai (dead URL pattern)
  ]);

  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // deduplicate by URL
  const seen = new Set();
  return all.filter(job => {
    const key = job.url || job.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { scrapeAllSources, scrapeLinkedInRSS, scrapeLinkedInMumbai, scrapeShine, scrapeLinkedInCookie, scrapeNaukri, scrapeIndeedIndia, parseSalaryMin };
