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

    /* ► Flood yazarını (handle) al */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* ► “Show this thread” varsa tıkla (ilk tweet altında) */
    await page.evaluate(() => {
      const spans = [...document.querySelectorAll('span')];
      const s = spans.find(sp => sp.textContent?.trim().toLowerCase() === 'show this thread');
      if (s) s.closest('a,button,div[role="button"]')?.click();
    });
    await page.waitForTimeout(600);

    /* ► Aşağı kaydır; başka kullanıcı tweet’i görünce dur */
    let done = false;
    let safety = 0;
    while (!done && safety < 120) {
      done = await page.evaluate(handle => {
        const arts = [...document.querySelectorAll('article')];
        if (!arts.length) return false;
        const last = arts[arts.length - 1];
        const link = last.querySelector('a[href*="/status/"]');
        const who  = link ? link.getAttribute('href').split('/')[1] : '';
        if (who && who !== handle) return true; // başka yazar gördük → dur
        window.scrollBy(0, 1000);
        return false;
      }, author);
      await page.waitForTimeout(400);
      safety++;
    }

    /* ► Flood sahibine ait tweetleri topla */
    const tweets = await page.evaluate(handle =>
      [...document.querySelectorAll('article')]
        .filter(a => {
          const h = a.querySelector('a[href*="/status/"]');
          return h && h.getAttribute('href').split('/')[1] === handle;
        })
        .map(a => {
          const d = a.querySelector('div[data-testid="tweetText"]');
          return d ? d.innerText.trim() : null;
        })
        .filter(Boolean)
    , author);

    await browser.close();
    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
