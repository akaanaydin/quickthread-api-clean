const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method allowed' });
  }

  const { url, cookies } = req.body || {};
  if (!url || !cookies) {
    return res.status(400).json({ error: 'Missing url or cookies' });
  }

  const tweetIdMatch = url.match(/status\/(\d+)/);
  const tweetId = tweetIdMatch?.[1];
  if (!tweetId) {
    return res.status(400).json({ error: 'Invalid tweet URL' });
  }

  const tweetPageUrl = `https://x.com/i/web/status/${tweetId}`;
  console.log("🔗 Tweet URL:", tweetPageUrl);

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie: cookies });

    await page.goto(tweetPageUrl, { waitUntil: 'networkidle2' });
    await page.waitForTimeout?.(2500) ?? new Promise(r => setTimeout(r, 2500));

    // login kontrol
    const html = await page.content();
    if (html.includes("Log in") || html.includes("Sign up")) {
      console.log("⚠️ Login sayfası geldi");
      return res.status(403).json({ error: "Giriş yapılmamış — geçersiz cookie" });
    }

    // ilk tweet'e tıklama
    await page.evaluate(() => {
      const tweetAnchor = document.querySelector('a time')?.closest('a');
      if (tweetAnchor) tweetAnchor.click();
    });

    await page.waitForTimeout?.(2000) ?? new Promise(r => setTimeout(r, 2000));

    // scroll ve içerik toplama
    for (let i = 0; i < 20; i++) {
      const count = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      console.log(`🔁 Scroll step ${i}, tweet count: ${count}`);
      if (count >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 500));
    }

    const tweets = await page.$$eval(
      'article div[data-testid="tweetText"]',
      nodes => nodes.map(el => el.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    await browser.close();

    if (!tweets.length) {
      console.log("⚠️ Tweet içeriği boş");
      return res.status(200).json({ text: '[Tweet bulunamadı — içerik boş]' });
    }

    let finalText = tweets.join('\n\n');
    if (tweets.length === 15) {
      finalText += `\n\n…Devamı için: ${url}`;
    }

    console.log("✅ Tweetler başarıyla alındı:", tweets.length);
    return res.status(200).json({ text: finalText });

  } catch (err) {
    console.error("❌ Hata:", err.message);
    return res.status(500).json({ error: "Flood çekilemedi", detail: err.message });
  }
};
