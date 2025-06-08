const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  /* ▸ URL doğrulama -------------------------------------------------------- */
  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com')))
    return res.status(400).json({ error: 'Geçersiz tweet URL' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId) return res.status(400).json({ error: 'Tweet ID bulunamadı' });

  try {
    /* ▸ Headless tarayıcı --------------------------------------------------- */
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* 1️⃣  Flood yazarının kullanıcı adını (handle) al */
    const author = await page.evaluate(() => {
      const anchor = document.querySelector('a[role="link"][href*="/status/"]');
      return anchor ? anchor.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bilgisi alınamadı');

    /* 2️⃣  Show more / Show more replies düğmelerini tıkla */
    for (;;) {
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"],button')];
        for (const b of btns) {
          const t = (b.innerText || '').toLowerCase().trim();
          if (t === 'show more' || t === 'show replies' || t === 'show more replies') {
            b.click();
            return true;
          }
        }
        return false;
      });
      if (!clicked) break;
      await page.waitForTimeout(600);
    }

    /* 3️⃣  Sayfanın sonuna kadar kaydır */
    await page.evaluate(async () => {
      await new Promise(resolve => {
        const scroll = () => {
          const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement;
          if (scrollTop + clientHeight + 200 < scrollHeight) {
            window.scrollBy(0, 1200);
            setTimeout(scroll, 400);
          } else {
            resolve();
          }
        };
        scroll();
      });
    });

    /* 4️⃣  Yalnızca yazarın tweet’lerini al */
    const tweets = await page.evaluate(handle => {
      return [...document.querySelectorAll('article')]
        .filter(article => {
          const a = article.querySelector('a[href*="/status/"]');
          return a && a.getAttribute('href').split('/')[1] === handle;
        })
        .map(article => {
          const div = article.querySelector('div[data-testid="tweetText"]');
          return div ? div.innerText.trim() : null;
        })
        .filter(Boolean);
    }, author);

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
