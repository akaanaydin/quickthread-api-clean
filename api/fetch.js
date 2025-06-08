const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com')))
    return res.status(400).json({ error: 'Geçersiz tweet URL' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId) return res.status(400).json({ error: 'Tweet ID bulunamadı' });

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* 1) flood yazarının kullanıcı adını al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* 2) ilk tweet’e (tarih linki) tıkla → thread görünümü */
    await page.evaluate(() => {
      const ts = document.querySelector('a time');
      ts?.closest('a')?.click();
    });

    /* 3) yüklenme için 1,5 s bekle */
    await new Promise(r => setTimeout(r, 1500));

    /* 4) flood sahibinin tweet’lerini topla (maks. 15) */
    const { slice, total } = await page.evaluate((handle, limit) => {
      const alls = [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => a.querySelector('div[data-testid="tweetText"]')?.innerText.trim())
        .filter(Boolean);

      return { slice: alls.slice(0, limit), total: alls.length };
    }, author, 15);

    await browser.close();

    let text = slice.join('\n\n');
    if (total > 15) text += `\n\n… Devamını okumak istersen: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
