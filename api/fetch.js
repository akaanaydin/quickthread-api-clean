const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST method' });
  }

  const { url, cookies } = req.body || {};
  if (!url || !cookies) {
    return res.status(400).json({ error: 'Missing url or cookies' });
  }

  const tweetIdMatch = url.match(/status\/(\d+)/);
  const tweetId = tweetIdMatch?.[1];
  if (!tweetId) {
    return res.status(400).json({ error: 'Invalid tweet URL' });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // Add cookies as raw header
    await page.setExtraHTTPHeaders({ cookie: cookies });

    // Go to tweet thread page
    await page.goto(`https://x.com/i/web/status/${tweetId}`, {
      waitUntil: 'networkidle2'
    });

    // Click the first tweet to open thread view
    await page.evaluate(() => {
      const a = document.querySelector('a time')?.closest('a');
      if (a) a.click();
    });

    // Wait a bit for tweets to load
    await new Promise(r => setTimeout(r, 2500));

    // Scroll to load more tweets, up to 15 max
    for (let i = 0; i < 20; i++) {
      const count = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (count >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
    }

    // Get the tweet texts
    const tweets = await page.$$eval(
      'article div[data-testid="tweetText"]',
      els => els.map(el => el.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    await browser.close();

    if (!tweets.length) {
      return res.status(200).json({ text: '[Boş içerik — tweetler çekilemedi]' });
    }

    let summary = tweets.join('\n\n');
    if (tweets.length === 15) {
      summary += `\n\n…Devamı: ${url}`;
    }

    return res.status(200).json({ text: summary });

  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
