const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url, cookies } = req.body || {};
  if (!url || !cookies)
    return res.status(400).json({ error: 'url or cookies missing' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId)
    return res.status(400).json({ error: 'bad tweet url' });

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    /* ➊  Çerez zincirini doğrudan “Cookie” başlığına koy */
    await page.setExtraHTTPHeaders({ cookie: cookies });

    /* ➋  Thread sayfasına git */
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* ➌  İlk tweet’e tıkla → thread aç */
    await page.evaluate(() => document.querySelector('a time')?.closest('a')?.click());
    await page.waitForTimeout(1200);

    /* ➍  Aşağı kaydırıp en az 15 tweet görünene kadar devam et */
    for (let i = 0; i < 25; i++) {
      const n = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (n >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(400);
    }

    /* ➎  İlk 15 tweet metnini al */
    const list = await page.$$eval(
      'article div[data-testid="tweetText"]',
      d => d.map(x => x.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    await browser.close();

    let text = list.join('\n\n');
    if (list.length === 15) text += `\n\n…Devamı: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
