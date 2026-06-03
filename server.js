// ============================================
//  ADT Treatment Plan - PDF Generation Server
//  Puppeteer screenshot -> PDF (pdf-lib)
//  Reliable: no page-break / black-page issues
// ============================================

const express = require('express');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

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

let browser = null;
async function getBrowser() {
  try { if (browser && browser.connected) return browser; } catch (e) {}
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

// Image sharpness. 1.5 keeps us under Chromium's ~16384px capture limit
// and under the PDF 14400pt page-size limit for this page height.
const SCALE = 1.5;

app.post('/generate-pdf', async (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).send('No HTML provided');

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 430, height: 1000, deviceScaleFactor: SCALE });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Use SCREEN styles (avoids @media print page-breaks that cause black pages)
    await page.emulateMediaType('screen');

    // Wait for fonts + images, capped so it never hangs
    await page.evaluate(async () => {
      const fontsReady = (document.fonts && document.fonts.ready)
        ? document.fonts.ready : Promise.resolve();
      const imgs = Array.from(document.images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(r => { img.onload = img.onerror = r; });
      });
      await Promise.race([
        Promise.all([fontsReady, ...imgs]),
        new Promise(r => setTimeout(r, 6000))
      ]);
    });
    await new Promise(r => setTimeout(r, 400));

    // Full-page screenshot -> always renders the whole page correctly
    const pngBytes = await page.screenshot({ fullPage: true, type: 'png' });

    // Embed the screenshot into a single-page PDF sized to the CSS dimensions
    const pdfDoc = await PDFDocument.create();
    const png = await pdfDoc.embedPng(pngBytes);
    const wPt = png.width / SCALE;
    const hPt = png.height / SCALE;
    const pdfPage = pdfDoc.addPage([wPt, hPt]);
    pdfPage.drawImage(png, { x: 0, y: 0, width: wPt, height: hPt });
    const pdfBytes = await pdfDoc.save();

    const pdf = Buffer.from(pdfBytes);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Treatment_Plan.pdf"',
      'Content-Length': pdf.length
    });
    res.end(pdf);

  } catch (err) {
    console.error('PDF generation error:', err);
    try { if (browser) await browser.close(); } catch (e) {}
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
