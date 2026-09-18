/**
 * Job Scraper — fetches listings from multiple job boards
 * Sources: RemoteOK, We Work Remotely, Remotive, LinkedIn RSS, Indeed RSS
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

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'JobAgent/1.0 (personal job search bot)' } }, res => {
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
    const url = `https://weworkremotely.com/remote-jobs/search.rss?term=${encodeURIComponent(keyword)}`;
    const { status, body } = await fetch(url);
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
 * LinkedIn - Mumbai jobs RSS (specific location)
 */
async function scrapeLinkedInMumbai(keyword) {
  console.log('  Fetching LinkedIn Mumbai RSS...');
  try {
    const encoded = encodeURIComponent(keyword);
    // f_WT=2 = remote, f_CC=105847 = Mumbai
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encoded}&f_WT=2&f_JT=F&f_CC=105847&sortBy=DD&format=rss`;
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

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Scrapes all sources for a list of keywords.
 * Returns deduplicated array of job objects.
 */
async function scrapeAllSources(keywords) {
  const primaryKeyword = keywords[0]; // e.g. "GCP Engineer"
  const searchTerms    = ['GCP Engineer', 'Cloud Architect', 'Platform Engineer', 'Google Cloud'];

  const results = await Promise.allSettled([
    scrapeRemoteOK(keywords),
    scrapeRemotive('GCP'),
    scrapeRemotive('Google Cloud'),
    scrapeRemotive('BigQuery'),
    scrapeRemotive('Cloud Migration'),
    scrapeRemotive('Data Migration'),
    scrapeRemotive('Platform Engineer'),
    scrapeRemotive('Cloud Architect'),
    scrapeRemotive('Cloud Engineer'),
    scrapeWeWorkRemotely('GCP'),
    scrapeWeWorkRemotely('Google Cloud'),
    scrapeWeWorkRemotely('Cloud Migration'),
    scrapeWeWorkRemotely('Platform Engineer'),
    scrapeWeWorkRemotely('Cloud Architect'),
    scrapeLinkedInRSS('GCP Engineer'),
    scrapeLinkedInRSS('GCP Cloud Engineer'),
    scrapeLinkedInRSS('GCP Platform Engineer'),
    scrapeLinkedInRSS('Google Cloud Architect'),
    scrapeLinkedInRSS('Cloud Platform Engineer'),
    scrapeLinkedInRSS('BigQuery Engineer'),
    scrapeLinkedInRSS('Cloud Migration'),
    scrapeLinkedInRSS('Data Migration'),
    scrapeLinkedInRSS('Platform Ops'),
    scrapeLinkedInRSS('L3 Support GCP'),
    scrapeLinkedInRSS('Support Engineer GCP'),
    scrapeLinkedInRSS('Technical Support Engineer'),
    scrapeLinkedInRSS('Cloud Support'),
    scrapeLinkedInRSS('Cloud Architect'),
    scrapeLinkedInRSS('DevOps Engineer GCP'),
    scrapeLinkedInRSS('Platform Engineer'),
    scrapeLinkedInRSS('Site Reliability Engineer GCP'),
    scrapeLinkedInRSS('Principal Cloud Engineer'),
    // Mumbai specific searches
    scrapeLinkedInMumbai('GCP Engineer'),
    scrapeLinkedInMumbai('Google Cloud Architect'),
    scrapeLinkedInMumbai('Platform Engineer'),
    scrapeLinkedInMumbai('Cloud Engineer'),
    scrapeLinkedInMumbai('DevOps Engineer'),
    scrapeLinkedInMumbai('Support Engineer'),
    scrapeLinkedInMumbai('L3 Engineer'),
    scrapeLinkedInMumbai('Technical Support')
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

module.exports = { scrapeAllSources, scrapeLinkedInMumbai };
