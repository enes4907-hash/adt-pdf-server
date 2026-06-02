const { join } = require('path');

/** Force Puppeteer to store Chromium inside the project so build & runtime share it */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
