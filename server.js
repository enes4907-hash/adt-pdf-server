// ============================================
//  ADT Treatment Plan - PDF Generation Server
//  Puppeteer + Express
// ============================================

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

// Allow large HTML payloads (the page is ~1.8MB)
app.use(express.json({ limit: '25mb' }));

// CORS - allow requests from your Netlify site
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check (UptimeRobot pings this to keep server awake)
app.get('/', (req, res) => {
  res.send('ADT PDF Server is running.');
});

// Reuse one browser instance (faster - no relaunch each request)
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browserPromise;
}

app.post('/generate-pdf', async (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).send('No HTML provided');

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Mobile-aspect width, retina quality
    await page.setViewport({ width: 430, height: 1200, deviceScaleFactor: 2 });

    // Load the HTML and wait for network to settle
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    // Make sure ALL fonts + images are fully loaded (fixes missing images)
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(img => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
            setTimeout(resolve, 8000); // safety timeout
          });
        })
      );
    });

    // Small extra settle time
    await new Promise(r => setTimeout(r, 400));

    // Measure full content height -> single tall page (no black gaps, no cut-off)
    const height = await page.evaluate(() => {
      return Math.ceil(document.body.scrollHeight);
    });

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
    res.status(500).send('PDF generation failed: ' + err.message);
  } finally {
    if (page) await page.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('PDF server listening on port ' + PORT));
