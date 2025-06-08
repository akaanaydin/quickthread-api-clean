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

    /* 1️⃣  Flood yazarının kullanıcı adını al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* 2️⃣  İlk tweet’e (tarih linki) tıkla → thread görünümü */
    await page.evaluate(() => {
      const ts = document.querySelector('a time');
      ts?.closest('a')?.click();
    });

    /* 3️⃣  Tweet’lerin yüklenebilmesi için 1,5 sn bekle */
    await new Promise(r => setTimeout(r, 1500));

    /* 4️⃣  Show more / Show replies butonlarına bas */
    for (;;) {
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"],button')];
        for (const b of btns) {
          const t = (b.innerText || '').trim().toLowerCase();
          if (t === 'show more' || t === 'show replies' || t === 'show more replies') {
            b.click(); return true;
          }
        }
        return false;
      });
      if (!clicked) break;
      await new Promise(r => setTimeout(r, 600));
    }

    /* 5️⃣  Aşağı kaydır; farklı yazar görünce dur */
    let stop = false, guard = 0;
    while (!stop && guard < 120) {
      stop = await page.evaluate(handle => {
        const arts = [...document.querySelectorAll('article')];
        if (!arts.length) return false;
        const last = arts[arts.length - 1];
        const link = last.querySelector('a[href*="/status/"]');
        const who  = link ? link.getAttribute('href').split('/')[1] : '';
        if (who && who !== handle) return true;   // farklı yazar → dur
        window.scrollBy(0, 1000);
        return false;
      }, author);
      await new Promise(r => setTimeout(r, 400));
      guard++;
    }

    /* 6️⃣  Sadece flood yazarının tweet’lerini topla */
    const tweets = await page.evaluate(handle =>
      [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => a.querySelector('div[data-testid="tweetText"]')?.innerText.trim())
        .filter(Boolean)
    , author);

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
