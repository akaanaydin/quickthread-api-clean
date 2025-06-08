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

    /* ► flood sahibinin kullanıcı adını al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* ► ilk tweet’e tıkla */
    await page.evaluate(() => {
      document.querySelector('a time')?.closest('a')?.click();
    });

    await new Promise(r => setTimeout(r, 1000));   // 1 sn bekle

    /* ► Aşağı kaydır – 15 tweet toplanana kadar */
    let tries = 0;
    while (tries < 20) {                 // en fazla 20 tur
      const collected = await page.evaluate(handle => {
        return [...document.querySelectorAll('article')]
          .filter(a => {
            const h = a.querySelector('a[href*="/status/"]');
            return h && h.getAttribute('href').split('/')[1] === handle;
          }).length;
      }, author);

      if (collected >= 15) break;        // yeterli
      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(r => setTimeout(r, 400));
      tries++;
    }

    /* ► ilk 15 tweet’i topla */
    const { slice, total } = await page.evaluate((handle, limit) => {
      const all = [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => a.querySelector('div[data-testid="tweetText"]')?.innerText.trim())
        .filter(Boolean);
      return { slice: all.slice(0, limit), total: all.length };
    }, author, 15);

    await browser.close();

    let text = slice.join('\n\n');
    if (total > 15) text += `\n\n… Devamını okumak istersen: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
