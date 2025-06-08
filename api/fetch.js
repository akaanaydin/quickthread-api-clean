const axios   = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url, cookies } = req.body || {};
  if (!url || !cookies)
    return res.status(400).json({ error: 'Missing url or cookies' });

  /* tweet ID + kullanıcı adı ayıkla */
  const m = url.match(/https?:\/\/[^/]+\/([^/]+)\/status\/(\d+)/);
  if (!m) return res.status(400).json({ error: 'Bad tweet URL' });
  const [ , user, id ] = m;

  /* mobil Twitter URL’si */
  const mURL = `https://mobile.twitter.com/${user}/status/${id}`;

  try {
    const { data: html } = await axios.get(mURL, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': cookies            /*  ← auth_token=…; ct0=…; guest_id=…  */
      },
      timeout: 10000
    });

    /* giriş sayfası yerine beklenen tweet geldi mi? */
    if (/Log in|Sign up/i.test(html))
      return res.status(403).json({ error: 'Cookie geçersiz – giriş sayfası döndü' });

    /* HTML parse */
    const $ = cheerio.load(html);

    /* Flood içindeki tweet metinleri  */
    const tweets = $('div.tweet-text, div[dir="auto"]')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);

    if (!tweets.length)
      return res.status(200).json({ text: '[Tweet bulunamadı] ' });

    const slice = tweets.slice(0, 15);
    let text = slice.join('\n\n');
    if (tweets.length > 15)
      text += `\n\n…Devamı: ${url}`;

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
