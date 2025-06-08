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
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* 1️⃣  Show more / Show more replies düğmelerine tıkla (varsa hepsine) */
    for (;;) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"],button'));
        for (const btn of buttons) {
          const txt = btn.innerText?.trim().toLowerCase();
          if (txt === 'show more' || txt === 'show replies' || txt === 'show more replies') {
            btn.click();
            return true; // bir tane tıkladık, döngü devam etsin
          }
        }
        return false; // tıklanacak düğme kalmadı
      });
      if (!clicked) break;
      await page.waitForTimeout(600);
    }

    /* 2️⃣  Otomatik kaydır: sayfa sonuna kadar */
    await page.evaluate(async () => {
      await new Promise(resolve => {
        const step = () => {
          const {scrollTop, scrollHeight, clientHeight} = document.scrollingElement;
          if (scrollTop + clientHeight + 100 < scrollHeight) {
            window.scrollBy(0, 1200);
            setTimeout(step, 400);
          } else {
            resolve();
          }
        };
        step();
      });
    });

    /* 3️⃣  Flood metnini topla */
    const tweets = await page.$$eval(
      'div[data-testid="tweetText"]',
      divs => divs.map(d => d.innerText.trim()).filter(Boolean)
    );

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
