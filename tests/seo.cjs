'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const origin = 'https://zhenya.olegluzin.ru';
const canonical = origin + '/';
const approvedFiles = JSON.parse(fs.readFileSync(path.join(root, 'scripts/public-files.json'), 'utf8'));
const read = name => fs.readFileSync(path.join(root, 'dist', name));
const text = name => read(name).toString('utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const failures = [], observations = [];
function check(label, action) {
  try { action(); observations.push({label, ok: true}); }
  catch (error) { failures.push(label + ': ' + error.message); observations.push({label, ok: false, error: error.message}); }
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
}
function htmlFacts(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]));
  const meta = key => metas.filter(m => (m.name || m.property) === key).map(m => m.content);
  const description = meta('description')[0];
  assert.equal(meta('description').length, 1, 'one description is required');
  assert.ok(description && description.length > 60, 'description must explain the game');
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  assert.ok(title?.includes('Люблю Женёчка'), 'consistent project name is required');
  assert.deepEqual(links.filter(l => l.rel === 'canonical').map(l => l.href), [canonical]);
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  assert.equal(headings.length, 1, 'one stable page H1 is required');
  assert.ok(headings[0][0].includes('id="page-title"') && headings[0][1].includes('Люблю Женёчка'));
  assert.match(html, /<h2 id="message">/, 'game states must not overwrite the page H1');
  assert.ok(html.includes('<p>' + description + '</p>'), 'description must remain visible text');
  for (const m of metas) if (/^(robots|googlebot|bingbot|yandex|yandexbot)$/i.test(m.name || '')) {
    assert.ok(!/noindex|none|nosnippet|nofollow/i.test(m.content || ''), 'public root must remain indexable');
  }
  assert.deepEqual(meta('og:title'), [title]);
  assert.deepEqual(meta('twitter:title'), [title]);
  assert.deepEqual(meta('og:description'), [description]);
  assert.deepEqual(meta('twitter:description'), [description]);
  assert.deepEqual(meta('og:url'), [canonical]);
  assert.deepEqual(meta('og:type'), ['website']);
  assert.deepEqual(meta('twitter:card'), ['summary_large_image']);
  assert.deepEqual(meta('og:image'), [origin + '/assets/social-card.png']);
  assert.deepEqual(meta('twitter:image'), meta('og:image'));
  const schemaText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const schema = JSON.parse(schemaText);
  assert.equal(schema['@context'], 'https://schema.org');
  assert.deepEqual(schema['@graph'].map(n => n['@type']).sort(), ['VideoGame', 'WebPage', 'WebSite']);
  for (const node of schema['@graph']) {
    assert.equal(node.url, canonical);
    assert.ok(node.name.includes('Люблю Женёчка'));
    assert.equal(node.inLanguage, 'ru');
    assert.ok(!node.author && !node.review && !node.aggregateRating, 'do not publish personal profiles or invented claims');
    if (node.description) assert.equal(node.description, description);
  }
  assert.ok(!/(?:^|[^\p{L}\p{N}])\d+\s*(?:лет|года?|ЛЕТ)(?=$|[^\p{L}\p{N}])/u.test(html), 'age must not return to HTML');
  assert.ok(!html.includes('Саша, 6 лет') && !html.includes('САША · 6 ЛЕТ'));
  assert.ok(!/https?:\/\/[^"'\s<]+(?:token|password|secret)=/i.test(html));
  return {title, description};
}
const localHtml = text('index.html');
check('HTML metadata, stable heading, visible description and truthful structured data', () => htmlFacts(localHtml));
check('Description matches real levels and controls', () => {
  const source = text('game.js');
  const levelData = source.match(/const LEVELS=(\[[\s\S]*?\n\]);/)[1];
  const levels = vm.runInNewContext(levelData, Object.create(null), {timeout: 1000});
  assert.equal(levels.length, 2, 'update the public description when level count changes');
  assert.match(localHtml, /Два уровня/);
  assert.match(levels[1].name, /Московские/);
  for (const feature of ['keydown', 'pointerdown', 'pointermove', 'ArrowLeft', 'Space']) assert.ok(source.includes(feature));
  assert.ok(!/(?:^|[^\p{L}\p{N}])\d+\s*(?:лет|года?|ЛЕТ)(?=$|[^\p{L}\p{N}])/u.test(source), 'age must not return to game captions');
  assert.ok(!/\$\(['"]page-title['"]\)/.test(source), 'game must not overwrite page heading');
});
check('Only the agreed root is in sitemap and crawler policy is preserved', () => {
  const sitemap = text('sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), [canonical]);
  const robots = text('robots.txt');
  assert.equal(robots.trim(), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml`);
  assert.ok(!fs.existsSync(path.join(root, 'dist/llms.txt')), 'no automatic AI standards file');
});
check('Known public files only; source photos and documentation cannot enter release', () => {
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(path.join(root, 'dist'), path.join(dir, e.name)).split(path.sep).join('/')]);
  const files = walk(path.join(root, 'dist'));
  // Legacy private checkout notes stay local and are explicitly excluded by the packager.
  assert.deepEqual(files.filter(n => n !== 'METRIKA.md').sort(), [...approvedFiles].sort());
  for (const name of approvedFiles) {
    assert.ok(!/(?:^|\/)(?:\.|private|rooms|collections|photos)/i.test(name) || name === '.htaccess');
    assert.ok(!/\.(?:md|zip|env|bak|sql)$/i.test(name));
    assert.ok(fs.statSync(path.join(root, 'dist', name)).isFile());
  }
  const png = read('assets/social-card.png');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
check('Redirect configuration and directory privacy', () => {
  const rules = text('.htaccess');
  assert.match(rules, /Options -Indexes/);
  assert.match(rules, /THE_REQUEST/);
  assert.match(rules, /index\\\.\(\?:html\|php\)/);
  assert.match(rules, /HTTP:X-Forwarded-Proto/);
  assert.ok(rules.includes(canonical));
  assert.ok(!rules.includes('[R=302'), 'canonical redirects must be permanent');
  assert.ok(!/^RewriteRule.*index\.html.*\[.*L.*\]/m.test(rules), 'no catch-all SPA rewrite that hides 404s');
});

async function request(url) {
  // Curl keeps TLS verification enabled and works across the local Node runtimes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhenya-seo-'));
  try {
    const headersPath = path.join(dir, 'headers');
    const bodyPath = path.join(dir, 'body');
    const status = Number(execFileSync('curl', ['-q', '--http1.1', '--silent', '--show-error',
      '--retry', '2', '--retry-all-errors', '--max-time', '20', '--dump-header', headersPath,
      '--output', bodyPath, '--write-out', '%{http_code}', url], {encoding: 'utf8'}));
    const blocks = fs.readFileSync(headersPath, 'utf8').trim().split(/\r?\n\r?\n/);
    const lastHeaders = blocks.at(-1).split(/\r?\n/).slice(1);
    const headerMap = new Map(lastHeaders.map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }));
    const body = fs.readFileSync(bodyPath);
    return {status, headers: {get: name => headerMap.get(name.toLowerCase()) || null},
      arrayBuffer: async () => body};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
async function live() {
  for (const url of ['http://zhenya.olegluzin.ru/', 'https://www.zhenya.olegluzin.ru/', 'http://www.zhenya.olegluzin.ru/', canonical + 'index.html', canonical + 'index.php']) {
    let current = url;
    const visited = new Set();
    // Beget upgrades HTTP in nginx before Apache can remove www or index paths.
    // Allow that extra permanent hop, while detecting cycles and wrong destinations.
    for (let hop = 0; current !== canonical; hop++) {
      assert.ok(hop < 3 && !visited.has(current), 'redirect loop or excessive chain: ' + url);
      visited.add(current);
      const r = await request(current);
      const location = r.headers.get('location');
      observations.push({url: current, status: r.status, location});
      assert.ok([301, 308].includes(r.status), 'permanent redirect missing: ' + current);
      assert.ok(location, 'redirect target missing');
      const next = new URL(location, current);
      assert.equal(next.protocol, 'https:', 'redirect must use HTTPS');
      assert.ok(['zhenya.olegluzin.ru', 'www.zhenya.olegluzin.ru'].includes(next.host), 'redirect leaves game domain');
      current = next.href;
    }
    const final = await request(current);
    assert.equal(final.status, 200, 'canonical redirect must end with 200');
  }
  for (const file of approvedFiles.filter(n => n !== '.htaccess')) {
    const url = file === 'index.html' ? canonical : canonical + file;
    const r = await request(url);
    const body = Buffer.from(await r.arrayBuffer());
    observations.push({url, status: r.status, sha256: hash(body)});
    assert.equal(r.status, 200, 'public file unavailable: ' + file);
    assert.ok(!/noindex|none/i.test(r.headers.get('x-robots-tag') || ''), 'unexpected noindex: ' + file);
    assert.equal(hash(body), hash(read(file)), 'published file does not match source: ' + file);
    if (file === 'index.html') htmlFacts(body.toString('utf8'));
  }
  const query = await request(canonical + '?utm_source=seo-release-check');
  assert.equal(query.status, 200);
  assert.equal(hash(Buffer.from(await query.arrayBuffer())), hash(read('index.html')));
  const redirectQuery = await request(canonical + 'index.html?utm_source=seo-release-check');
  assert.ok([301, 308].includes(redirectQuery.status));
  assert.equal(new URL(redirectQuery.headers.get('location'), canonical).href, canonical + '?utm_source=seo-release-check');
  const missing = await request(canonical + 'seo-release-missing');
  assert.equal(missing.status, 404, 'missing page must not become a soft 404');
  const privateNote = await request(canonical + 'METRIKA.md');
  assert.ok([403, 404].includes(privateNote.status), 'private deployment note must not be published');
}
(async () => {
  if (process.argv.includes('--live') && !failures.length) {
    try { await live(); observations.push({label: 'Published redirects, checksums, indexability and 404s', ok: true}); }
    catch (error) { failures.push(error.message); observations.push({label: 'Published checks', ok: false, error: error.message}); }
  }
  const report = {checkedAt: new Date().toISOString(), mode: process.argv.includes('--live') ? 'local-and-live' : 'local', ok: !failures.length, failures, observations};
  const reportAt = process.argv.indexOf('--report');
  if (reportAt !== -1) fs.writeFileSync(process.argv[reportAt + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
})();
