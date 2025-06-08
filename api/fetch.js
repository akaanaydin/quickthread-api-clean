const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  // Yalnızca POST isteklerine izin ver
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  // Body’den tweet URL’sini al
  const { url } = req.body || {};
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    return res.status(400).json({ error: 'Geçersiz tweet URL' });
  }

  // Tweet ID’sini ayıkla
  const idMatch = url.match(/status\/(\d+)/);
  const tweetId = idMatch && idMatch[1];
  if (!tweetId) {
    return res.status(400).json({ error: 'Tweet ID bulunamadı' });
  }

  const fullURL = `https://x.com/i/web/status/${tweetId}`;

  try {
    // Headless Chromium’u başlat
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(fullURL, { waitUntil: 'networkidle2' });

    /* ----------------------------------------------------------
       Bazı puppeteer-core sürümlerinde page.waitForTimeout yok.
       Bunun yerine Promise tabanlı basit bekleme kullanıyoruz.
    ---------------------------------------------------------- */
    await new Promise(r => setTimeout(r, 2500)); // 2,5 saniye bekle

    // Flood’daki tweet metinlerini topla
    const tweets = await page.$$eval(
      'div[data-testid="tweetText"]',
      divs => divs.map(d => d.innerText).filter(Boolean)
    );

    await browser.close();

    return res.json({ text: tweets.join('\n\n') });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
