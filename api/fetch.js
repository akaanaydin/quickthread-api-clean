const axios   = require('axios');
const cheerio = require('cheerio');

const NITTERS = [
  'https://nitter.net',
  'https://nitter.pufe.org',
  'https://nitter.whatever.social',
  'https://nitter.cz'
];

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Use POST' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url missing' });

  /* tweet URL parçala */
  const m = url.match(/https?:\/\/[^/]+\/([^/]+)\/status\/(\d+)/);
  if (!m) return res.status(400).json({ error: 'bad tweet url' });
  const [ , user, id ] = m;

  for (const base of NITTERS) {
    try {
      const nURL = `${base}/${user}/status/${id}`;
      const { data } = await axios.get(nURL, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      /* HTML parse */
      const $ = cheerio.load(data);
      const tweets = $('div.main-tweet, .timeline-item')
        .map((_, el) => $(el).find('.tweet-content').text().trim())
        .get()
        .filter(Boolean);

      if (!tweets.length) throw new Error('empty');

      const slice = tweets.slice(0, 15);
      let text = slice.join('\n\n');
      if (tweets.length > 15) text += `\n\n…Devamı: ${url}`;

      return res.json({ text, via: base });
    } catch (e) {
      /* bu instance başarısız → sonraki dene */
    }
  }

  /* Hiçbiri çalışmazsa */
  res.status(502).json({ error: 'Flood çekilemedi', detail: 'all nitter instances failed' });
};
