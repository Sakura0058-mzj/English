const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const key = 'ielts-study-helper.speaking.v1';
const card = (id, original, extra = {}) => ({ id, original, createdAt: 10, order: 1, translation: 'test', star: 1, functions: [], substitutions: [{ id: id + '-sub', content: 'alternative' }], ...extra });
const fixture = { cards: {
  part1: [card('custom', 'My own expression.', { part1Category: 'dpf', structure: 'persona', functions: ['persona', 'like'], note: 'Existing note' }), card('uncertain', 'Unclassified custom expression.')],
  part2: [card('p2', 'Part 2 content')], part3: [card('p3', 'Part 3 content')],
  otherSynonyms: [card('old-yes', 'Absolutely.', { translation: '当然；绝对是。', star: 1 })],
  topics: { people: [card('topic', 'Topic content')] },
} };

(async () => {
  const server = http.createServer((req, res) => {
    const file = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(fs.readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ fixture, key }) => {
      if (localStorage.getItem('fixture-installed')) return;
      localStorage.setItem(key, JSON.stringify(fixture));
      localStorage.setItem('ielts-study-helper.speaking-cards-seed.v1', 'part1-structure-functions-v2');
      localStorage.setItem('fixture-installed', 'true');
    }, { fixture, key });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('ielts-study-helper.speaking.v1')));
    assert.equal(data.part1EnrichmentVersion, 'steps-notes-v1');
    assert.equal(data.cards.part2[0].original, 'Part 2 content');
    assert.equal(data.cards.part3[0].star, 1);
    assert.equal(data.cards.topics.people[0].original, 'Topic content');
    assert.equal(data.cards.part1.find(x => x.id === 'custom').note, 'Existing note');
    assert.equal(data.cards.part1.find(x => x.id === 'old-yes').star, 1);
    assert.equal(data.cards.otherSynonyms.find(x => x.id === 'uncertain').structure, '');
    assert.ok(data.cards.part1.every(x => x.functions.length <= 1));
    const coverage = await page.evaluate(() => Object.fromEntries(['dpf', 'dwc', 'dcf', 'oreo'].map(category => [category, getPart1Structures(category).map(([step]) => ({ step, count: state.speaking.cards.part1.filter(x => x.part1Category === category && x.structure === step).length }))])));
    for (const steps of Object.values(coverage)) for (const step of steps) assert.ok(step.count > 0, JSON.stringify(step));
    const enter = async category => {
      await page.locator('.nav-link[data-route="speaking"]').click();
      await page.locator('[data-speaking-screen-target="speaking-structure-home"]').click();
      await page.locator('[data-speaking-screen="speaking-structure-home"] [data-speaking-structure-part="part1"]').click();
      await page.locator(`[data-speaking-part1-category="${category}"]`).click();
      await page.locator('#speaking-library-tab').click();
    };
    for (const category of ['dpf', 'dwc', 'dcf', 'oreo']) {
      await enter(category);
      const steps = await page.locator('#speaking-structure-filter option').evaluateAll(options => options.map(x => x.value).filter(x => x !== 'all'));
      assert.ok(!steps.includes(category));
      for (const step of steps) {
        await page.locator('#speaking-structure-filter').selectOption(step);
        assert.ok(await page.locator('#speaking-card-list .library-row').count() > 0, category + '/' + step);
      }
      await page.locator('#speaking-card-list .library-row').first().click();
      assert.equal(await page.locator('#speaking-synonym-backdrop #speaking-card-category-row').isVisible(), true);
      assert.equal(await page.locator('#speaking-card-functions').evaluate(x => x.multiple), false);
      await page.locator('#speaking-card-structure').selectOption(steps[0]);
      assert.ok(await page.locator('#speaking-card-functions option').count() > 1);
      await page.keyboard.press('Escape');
    }
    await enter('dpf');
    await page.locator('#speaking-structure-filter').selectOption('direct');
    await page.locator('#speaking-function-filter').selectOption('yes');
    await page.locator('#speaking-card-list .library-row').first().click();
    await page.locator('#speaking-card-structure').selectOption('direct');
    await page.locator('#speaking-card-functions').selectOption('yes');
    await page.locator('#speaking-synonym-note').fill('Saved note after refresh');
    const noteBox = await page.locator('#speaking-synonym-note').boundingBox();
    const translationBox = await page.locator('#speaking-synonym-translation').boundingBox();
    const substitutionsBox = await page.locator('#speaking-substitution-list').boundingBox();
    assert.ok(noteBox.y > translationBox.y && noteBox.y < substitutionsBox.y);
    await page.screenshot({ path: path.join(os.tmpdir(), 'speaking-cards-desktop.png') });
    await page.locator('#speaking-synonym-save').click();
    const beforeReload = await page.evaluate(() => JSON.stringify(state.speaking));
    await page.reload();
    assert.deepEqual(await page.evaluate(() => state.speaking), JSON.parse(beforeReload));
    // Exercise the same payload hydration path used after a cloud download, offline.
    const payload = await page.evaluate(() => getCloudPayload());
    await page.evaluate(payload => applyCloudPayload(payload), payload);
    assert.deepEqual(await page.evaluate(() => state.speaking), JSON.parse(beforeReload));
    await enter('dpf');
    await page.locator('#speaking-structure-filter').selectOption('direct');
    await page.locator('#speaking-function-filter').selectOption('yes');
    await page.locator('#speaking-card-list .library-row').first().click();
    assert.equal(await page.locator('#speaking-synonym-note').inputValue(), 'Saved note after refresh');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#speaking-card-structure').isVisible(), true);
    assert.equal(await page.locator('#speaking-card-functions').isVisible(), true);
    assert.ok(await page.locator('.detail-modal:visible').evaluate(x => x.scrollWidth <= x.clientWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'speaking-cards-mobile.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { navigate('speaking'); openSpeakingOther(); });
    await page.locator('#speaking-library-tab').click();
    await page.locator('#speaking-card-list .library-row').first().click();
    assert.equal(await page.locator('#speaking-card-category-row').isVisible(), false);
    assert.equal(await page.locator('#speaking-synonym-note').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', coverage, checks: 'migration, all step filters, visible single selects, notes, reload, cloud payload hydration, mobile, other library' }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
