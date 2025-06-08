const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com')))
    return res.status(400).json({ error: 'Geçersiz tweet URL' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId)
    return res.status(400).json({ error: 'Tweet ID bulunamadı' });

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* 1 – İlk tweet’in tarih linkine tıkla (thread görünümü açılır) */
    await page.evaluate(() => {
      document.querySelector('a time')?.closest('a')?.click();
    });
    await new Promise(r => setTimeout(r, 1000));      // 1 sn bekle

    /* 2 – Aşağı kaydırarak en az 15 tweet görünür hâle gelene kadar devam et */
    let guard = 0;
    while (guard < 25) {                              // ≈ 10 s üst sınır
      const count = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (count >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(r => setTimeout(r, 400));
      guard++;
    }

    /* 3 – Ekranda görünen ilk 15 tweet’i topla (yazar bakılmaksızın) */
    const { slice, total } = await page.evaluate(limit => {
      const arr = [...document.querySelectorAll('article div[data-testid="tweetText"]')]
                  .map(d => d.innerText.trim())
                  .filter(Boolean);
      return { slice: arr.slice(0, limit), total: arr.length };
    }, 15);

    await browser.close();

    let text = slice.join('\n\n');
    if (total > 15) text += `\n\n…Devamını okumak istersen: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
