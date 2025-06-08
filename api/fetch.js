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

    /* 1️⃣ Flood sahibinin kullanıcı adını al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* 2️⃣ İlk tweete (tarih) tıkla → tüm thread açılır  */
    await page.evaluate(() => {
      document.querySelector('a time')?.closest('a')?.click();
    });
    /* Yüklenme için 1 s bekle */
    await new Promise(r => setTimeout(r, 1000));

    /* 3️⃣ Aşağı kaydır; 15 tweet dolunca veya farklı yazar görünce dur */
    let guard = 0;
    while (guard < 40) {                  // maks. 40 tur ≈ 16 s
      const { mine, others } = await page.evaluate(handle => {
        const arts = [...document.querySelectorAll('article')];
        let mine = 0, others = 0;
        for (const a of arts) {
          const h = a.querySelector('a[href*="/status/"]');
          if (!h) continue;
          const who = h.getAttribute('href').split('/')[1];
          if (who === handle) mine++; else others++;
        }
        return { mine, others };
      }, author);

      if (mine >= 15 || others > 0) break;

      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(r => setTimeout(r, 400));
      guard++;
    }

    /* 4️⃣ İlk 15 tweet’i topla */
    const { slice, total } = await page.evaluate((handle, lim) => {
      const tw = [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => a.querySelector('div[data-testid="tweetText"]')?.innerText.trim())
        .filter(Boolean);
      return { slice: tw.slice(0, lim), total: tw.length };
    }, author, 15);

    await browser.close();

    let text = slice.join('\n\n');
    if (total > 15) text += `\n\n… Devamını okumak istersen: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
