const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  /*— Yalnızca POST —*/
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  /*— URL doğrulama —*/
  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    return res.status(400).json({ error: 'Geçersiz tweet URL' });
  }

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId) {
    return res.status(400).json({ error: 'Tweet ID bulunamadı' });
  }

  try {
    /*— Headless Chromium —*/
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(`https://x.com/i/web/status/${tweetId}`, {
      waitUntil: 'networkidle2'
    });

    /* 1️⃣  Flood yazarının kullanıcı adını al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* 2️⃣  “Show this thread” düğmesine bas (varsa) */
    const clickedThread = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('span')];
      const span  = spans.find(s => s.textContent?.trim().toLowerCase() === 'Show more replies');
      if (!span) return false;
      const btn = span.closest('a,button,div[role="button"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clickedThread) await page.waitForTimeout(800);

    /* 3️⃣  “Show more / Show replies” düğmelerine ardışık tıkla */
    for (;;) {
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"],button')];
        for (const b of btns) {
          const t = (b.innerText || '').trim().toLowerCase();
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

    /* 4️⃣  Hem alta hem üste kaydır (lazy-load + eski tweet’ler) */
    const autoScroll = async dir => {
      await page.evaluate(async direction => {
        await new Promise(resolve => {
          const step = () => {
            window.scrollBy(0, direction === 'down' ? 1200 : -1200);
            setTimeout(() => {
              const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement;
              const done = direction === 'down'
                ? scrollTop + clientHeight + 300 >= scrollHeight
                : scrollTop <= 0;
              if (done) resolve(); else step();
            }, 400);
          };
          step();
        });
      }, dir);
    };
    await autoScroll('down');
    await autoScroll('up');

    /* 5️⃣  Yalnızca yazarın tweetlerini topla */
    const tweets = await page.evaluate(handle => {
      return [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => {
          const d = a.querySelector('div[data-testid="tweetText"]');
          return d ? d.innerText.trim() : null;
        })
        .filter(Boolean);
    }, author);

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
