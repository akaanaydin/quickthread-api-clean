/* … axios/cheerio sürümü yerine puppeteer kullanıyoruz (15 tweet çekmek için) */
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

function parseCookie(str) {
  return str.split(';').map(v => v.trim()).filter(Boolean).map(kv => {
    const [name, ...rest] = kv.split('=');
    return {
      name,
      value: rest.join('='),
      domain: '.twitter.com',
      path: '/',
      httpOnly: true,
      secure: true
    };
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url, cookies } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url missing' });
  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId) return res.status(400).json({ error: 'bad tweet url' });
  if (!cookies) return res.status(400).json({ error: 'cookies missing' });

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setCookie(...parseCookie(cookies));         // ⬅️ kullanıcının cookie’si
    await page.goto(`https://x.com/i/web/status/${tweetId}`, { waitUntil: 'networkidle2' });

    /* 1 sn yüklenme bekle, sonra aşağı kaydır  */
    await new Promise(r => setTimeout(r, 1000));
    let guard = 0;
    while (guard < 25) {
      const n = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      if (n >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
      guard++;
    }

    /* İlk 15 tweet */
    const list = await page.$$eval(
      'article div[data-testid="tweetText"]',
      d => d.map(x => x.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    await browser.close();

    const text = list.join('\n\n') +
      (list.length === 15 ? `\n\n…Devamı: ${url}` : '');

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
