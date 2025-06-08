const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    return res.status(400).json({ error: 'Geçersiz tweet URL' });
  }

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

    /* ▶️ 1) Show more düğmeleri varsa hepsine tıkla */
    let moreBtn;
    do {
      moreBtn = await page.$('div[role="button"]:has-text("Show more")');
      if (moreBtn) {
        await moreBtn.click();
        await page.waitForTimeout(600);
      }
    } while (moreBtn);

    /* ▶️ 2) Otomatik kaydır: sayfa sonuna kadar */
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let last = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, 1000);
          const sh = document.scrollingElement.scrollHeight;
          if (sh !== last) {
            last = sh;
          } else {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    });

    /* ▶️ 3) Tüm tweet metinlerini topla */
    const tweets = await page.$$eval(
      'div[data-testid="tweetText"]',
      divs => divs.map(d => d.innerText.trim()).filter(Boolean)
    );

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (e) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: e.message });
  }
};
