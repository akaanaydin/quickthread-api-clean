/*  api/fetch.js  – login cookie + ilk 15 tweet
   -----------------------------------------------------------
   İstek gövdesi  →  { url: "<tweet-URL>", cookies: "<cookie zinciri>" }
   Cookie zinciri →  auth_token=…; ct0=…; guest_id=…
   ----------------------------------------------------------- */

const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

/*─────────────────────────────────────────────────────────────*/
function parseCookieString(str = '') {
  /*  "a=1; b=2"  →  [{name:"a", value:"1", url:"https://twitter.com"}, …] */
  return str.split(';')
    .map(s => s.trim())
    .filter(Boolean)           // boş kırp
    .filter(kv => kv.includes('='))                // "secure" vb. tekil bayrakları at
    .map(kv => {
      const [name, ...rest] = kv.split('=');
      return {
        name,
        value: rest.join('='),
        url: 'https://twitter.com',                // domain/path yerine url kullanmak güvenli
        httpOnly: true,
        secure: true
      };
    });
}
/*─────────────────────────────────────────────────────────────*/

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url, cookies } = req.body || {};
  if (!url)     return res.status(400).json({ error: 'url missing' });
  if (!cookies) return res.status(400).json({ error: 'cookies missing' });

  const tweetId = (url.match(/status\/(\d+)/) || [])[1];
  if (!tweetId) return res.status(400).json({ error: 'bad tweet url' });

  const cookieArr = parseCookieString(cookies);
  if (!cookieArr.length) return res.status(400).json({ error: 'cookie parse fail' });

  try {
    /*–– Chromium launch ––*/
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless      // true → hız / bellek düşük
    });

    const page = await browser.newPage();
    await page.setCookie(...cookieArr);                          // girişli olun
    await page.goto(`https://x.com/i/web/status/${tweetId}`, {
      waitUntil: 'networkidle2'
    });

    /*— 1 sn bekle, ardından aşağı kaydır 15 tweet yakalayana kadar —*/
    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < 25; i++) {             // ≈ 10 s sınır
      const nTweets = await page.$$eval(
        'article div[data-testid="tweetText"]', d => d.length
      );
      if (nTweets >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
    }

    /*— İlk 15 tweet metnini al —*/
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
