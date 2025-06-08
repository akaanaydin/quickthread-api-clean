const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST method' });
  }

  const { url, cookies } = req.body || {};

  console.log("🟡 Gelen istek:", { url, cookies });

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

    console.log("✅ Sayfa açıldı, şimdi ilk tweete tıklıyoruz…");
    await page.evaluate(() => {
      const a = document.querySelector('a time')?.closest('a');
      if (a) a.click();
    });

    await new Promise(r => setTimeout(r, 2500));

    console.log("🔃 Scroll başlıyor…");
    for (let i = 0; i < 20; i++) {
      const count = await page.$$eval('article div[data-testid="tweetText"]', d => d.length);
      console.log(`↕️ Scroll step ${i}, tweet count: ${count}`);
      if (count >= 15) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await new Promise(r => setTimeout(r, 400));
    }

    console.log("📋 Tweet içerikleri çekiliyor…");
    const tweets = await page.$$eval(
      'article div[data-testid="tweetText"]',
      els => els.map(el => el.innerText.trim()).filter(Boolean).slice(0, 15)
    );

    console.log("🟢 Toplam tweet:", tweets.length);
    console.log("📝 İçerik örnekleri:", tweets.slice(0, 2));

    await browser.close();

    if (!tweets.length) {
      console.log("⚠️ Tweet bulunamadı.");
      return res.status(200).json({ text: '[Tweet bulunamadı — boş içerik]' });
    }

    let finalText = tweets.join('\n\n');
    if (tweets.length === 15) {
      finalText += `\n\n…Devamı için: ${url}`;
    }

    return res.status(200).json({ text: finalText });

  } catch (err) {
    console.error("❌ Hata:", err);
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
