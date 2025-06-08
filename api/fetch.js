/* URL’ye  ?debug=1  eklerseniz fonksiyon
   • her adımda kaç tweet gördüğünü Vercel log’una yazar
   • hata verirse ekran görüntüsünü base64 olarak detail’e koyar           */

const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  const debug = req.query?.debug === '1';

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url param missing' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];

  let browser;
  const log = (...args) => debug && console.log('[DBG]', ...args);

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page  = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    log('loaded thread page');

    /* tıkla */
    await page.evaluate(() => document.querySelector('a time')?.closest('a')?.click());
    await new Promise(r => setTimeout(r, 1200));

    const countNow = async () =>
      await page.$$eval('article div[data-testid="tweetText"]', d => d.length);

    log('after click, tweet count:', await countNow());

    /* kaydır */
    for (let i = 0; i < 30; i++) {
      const c = await countNow();
      if (c >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(r => setTimeout(r, 400));
      log('scroll step', i + 1, 'tweet count:', await countNow());
    }

    /* topla */
    const tweets = await page.$$eval(
      'article div[data-testid="tweetText"]',
      d => d.map(v => v.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    log('final tweet array length:', tweets.length);

    await browser.close();

    return res.json({
      text:
        tweets.join('\n\n') +
        (tweets.length === 15 ? `\n\n…Devamı için: ${url}` : '')
    });

  } catch (err) {
    if (debug && browser) {
      const [page] = await browser.pages();
      const snap  = await page.screenshot({ encoding: 'base64', fullPage: true });
      return res.status(500).json({
        error: 'debug-shot',
        detail: err.message,
        screenshot: snap.slice(0, 120_000)  // ilk 120 KB – log’u şişirmesin
      });
    }
    return res.status(500).json({ error: err.message });
  }
};
