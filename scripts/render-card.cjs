// Optional artwork refresh. Requires Playwright; the game itself has no dependencies.
const {chromium} = require(process.env.SEO_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({headless: true, ...(process.env.SEO_CHROMIUM_PATH ? {executablePath: process.env.SEO_CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
    const svg = fs.readFileSync(path.join(root, 'artwork/social-card.svg'), 'utf8');
    await page.setContent('<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>' + svg);
    await page.screenshot({path: path.join(root, 'dist/assets/social-card.png')});
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
