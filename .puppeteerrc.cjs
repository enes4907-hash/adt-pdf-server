const { join } = require('path');

/**
 * Chrome'u proje klasoru icine indir ki Render'da
 * build sonrasi runtime'da da bulunabilsin.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
