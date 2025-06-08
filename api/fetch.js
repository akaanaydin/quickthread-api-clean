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
    await page.setExtraHTTPHeaders({ cookie: cookies });

    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    // İlk tweet’e tıkla (daha fazla içerik açmak için)
    await page.evaluate(() => {
      const a = document.querySelector('a time')?.closest('a');
      if (a) a.click();
    });

    // ↓ Buradaki bekleme daha önce `waitForTimeout(1200)` idi
    await new Promise(r => setTimeout(r, 1200));

    // 15 tweet görünene kadar scroll yap
    for (let i = 0; i < 25; i++) {
      const count = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (count >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
    }

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
