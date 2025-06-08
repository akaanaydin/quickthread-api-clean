// api/fetch.js
const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');

/* Cookie satırını güvenle header’a ekle – validation yok  */
module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url, cookies } = req.body || {};
  if (!url || !cookies)
    return res.status(400).json({ error: 'Missing "url" or "cookies"' });

  const id = (url.match(/status\/(\d+)/) || [])[1];
  if (!id) return res.status(400).json({ error: 'Bad tweet URL' });

  const threadURL = `https://x.com/i/web/status/${id}`;

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    /* çerezleri header’da gönder */
    await page.setExtraHTTPHeaders({ cookie: cookies });

    await page.goto(threadURL, { waitUntil: 'networkidle2' });

    /* Login sayfası geldiyse çerez geçersizdir */
    if ((await page.content()).includes('Log in to X')) {
      await browser.close();
      return res.status(403).json({ error: 'Invalid or expired cookie' });
    }

    /* İlk tweete tıkla – thread görünümü */
    await page.evaluate(() => {
      document.querySelector('a time')?.closest('a')?.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    /* 15 tweet görünene dek aşağı kaydır */
    for (let i = 0; i < 25; i++) {
      const n = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (n >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
    }

    /* İlk 15 tweet metni */
    const tweets = await page.$$eval(
      'article div[data-testid="tweetText"]',
      els => els.map(e => e.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    await browser.close();

    if (!tweets.length)
      return res.status(200).json({ text: '[Tweet bulunamadı]' });

    let text = tweets.join('\n\n');
    if (tweets.length === 15)
      text += `\n\n…Devamı: ${url}`;

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
