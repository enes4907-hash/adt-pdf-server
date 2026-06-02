// ============================================
//  ADT Treatment Plan - PDF Generation Server
//  Puppeteer + Express (Render-ready, robust)
// ============================================

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '30mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.send('ADT PDF Server is running.');
});

// Reuse browser; relaunch if it died or a previous launch failed
let browser = null;
async function getBrowser() {
  try {
    if (browser && browser.connected) return browser;
  } catch (e) {}
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  return browser;
}

app.post('/generate-pdf', async (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).send('No HTML provided');

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Quality vs memory balance for free tier
    await page.setViewport({ width: 430, height: 1200, deviceScaleFactor: 1.5 });

    // Load HTML (scripts already stripped client-side, so this is fast)
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for fonts + images, but never hang (race with timeout)
    await page.evaluate(async () => {
      const fontsReady = (document.fonts && document.fonts.ready)
        ? document.fonts.ready : Promise.resolve();
      const imgs = Array.from(document.images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(r => { img.onload = img.onerror = r; });
      });
      const all = Promise.all([fontsReady, ...imgs]);
      const timeout = new Promise(r => setTimeout(r, 6000));
      await Promise.race([all, timeout]);
    });

    await new Promise(r => setTimeout(r, 300));

    const height = await page.evaluate(() => Math.ceil(document.body.scrollHeight));

    const pdf = await page.pdf({
      width: '430px',
      height: height + 'px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      pageRanges: '1'
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Treatment_Plan.pdf"',
      'Content-Length': pdf.length
    });
    res.send(pdf);

  } catch (err) {
    console.error('PDF generation error:', err);
    // If the browser crashed, drop it so the next request relaunches a fresh one
    try { if (browser) { await browser.close(); } } catch (e) {}
    browser = null;
    res.status(500).send('PDF generation failed: ' + err.message);
  } finally {
    try { if (page) await page.close(); } catch (e) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('PDF server listening on port ' + PORT);
});
