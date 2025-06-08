const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    return res.status(400).json({ error: 'Geçersiz tweet URL' });
  }

  const id = (url.match(/status\/(\d+)/) || [])[1];
  if (!id) return res.status(400).json({ error: 'Tweet ID bulunamadı' });

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${id}`, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2500);

    const tweets = await page.$$eval(
      'div[data-testid="tweetText"]',
      divs => divs.map(d => d.innerText).filter(Boolean)
    );

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (e) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: e.message });
  }
};


