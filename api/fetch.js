const axios   = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url missing' });

  /* URL’yi nitter biçimine dönüştür */
  const parts = url.replace(/^https?:\/\//, '').split('/');
  const user  = parts[1];
  const id    = parts[3];
  const nURL  = `https://nitter.net/${user}/status/${id}`;

  try {
    const { data } = await axios.get(nURL, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);

    /* Flood metinlerini seç: ana tweet + yanıtları */
    const tweets = $('div.main-tweet, .timeline-item').map((_, el) => {
      return $(el).find('.tweet-content').text().trim();
    }).get().filter(Boolean);

    const slice = tweets.slice(0, 15);
    let text = slice.join('\n\n');
    if (tweets.length > 15) text += `\n\n…Devamını okumak istersen: ${url}`;

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Flood çekilemedi', detail: err.message });
  }
};
