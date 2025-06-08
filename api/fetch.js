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

    /* ► 1) Flood yazarının kullanıcı adını yakala */
    const author = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/status/"]');
      return a ? a.getAttribute('href').split('/')[1] : null;
    });
    if (!author) throw new Error('Yazar bulunamadı');

    /* ► 2) “Show this thread” düğmesine bas (varsa) */
    const showThread = await page.$x("//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show this thread')]");
    if (showThread.length) {
      await showThread[0].click();
      await page.waitForTimeout(800);
    }

    /* ► 3) Sayfanın hem altına hem en üstüne kadar kaydır */
    const autoScroll = async (direction = 'down') => {
      await page.evaluate(async (dir) => {
        const step   = () => { window.scrollBy(0, dir === 'down' ? 1200 : -1200); };
        const done   = () => {
          const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement;
          return dir === 'down'
            ? scrollTop + clientHeight + 300 >= scrollHeight
            : scrollTop <= 0;
        };
        await new Promise(resolve => {
          const loop = () => {
            if (done()) return resolve();
            step(); setTimeout(loop, 400);
          };
          loop();
        });
      }, direction);
    };

    await autoScroll('down');   // alta kadar
    await autoScroll('up');     // başa kadar

    /* ► 4) Yalnızca yazarın tweet’lerini topla */
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
