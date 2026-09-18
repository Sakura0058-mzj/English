const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const syntax = spawnSync(process.execPath, ['--check'], { input: script, encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr);
const constants = script.slice(script.indexOf('const STORAGE_KEY'), script.indexOf('const WRITING_STORAGE_KEY'));
const seeds = script.slice(script.indexOf('const CAMBRIDGE6_SEED'), script.indexOf('let latestRequestId'));
const between = (start, end) => script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start)));
const functions = [
  between('function loadSavedWords()', 'function clearCambridge5ImportFlag()'),
  between('function applyCloudPayload(', 'async function initCloudSync()'),
  between('function getCloudPayload()', 'function cacheCloudPayload()'),
  between('function persistSavedWords(', 'function loadWritingData()'),
  script.match(/function normaliseWord\(value\)[^\n]+/)[0],
].join('\n');
const expected = {
  7: 'scrutiny|propagate|sustainable|cellulose|antibiotic|fertilise|fertilizer|outstrip|intricately|maze|scout|odour|bearing|prehistorical|edible|dental|variant|ancestral|emigrate|immigrate|prudent|priority|obstacle|submarine|manipulate|sophisticated|limb|navigation|jeopardize|irrigation|warrant|ritual|notoriety|spectacular|placebo|valid|suspend|pendulum|dynamic|cab|reserve|reserve a seat|reservation|luxury|majority|barbecue|mop|bucket|attitude|gender|creativity|incentive|stress|demonstrate|profit|magic|camp|intact|dentist|bridge|restaurant|screen|confidence|escape|chocolate|kitchen|nationality|assess|statistics|embassy|cheese|mineral|electricity|relevant|sledge|technology'.split('|'),
  8: 'chronic|timekeeping|artificial|equator|conspicuous|latitude|altitude|lunar|solar|Egyptian|municipal|virtually|disseminate|counterpart|basin|denote|pendulum|arc|grid|oversimplify|congest|margin|vicinity|meteorological|panel|alphabet|telepathy|psychologist|derision|rigorous|brink|sceptic|meditation|sensory|leakage|outright|fraud|esoteric|consistency|tint|tin|molten|embark|episode|amplify|Antarctica|hemisphere|reroute|perish|commodity|fodder|regime|medieval|olfaction|aromas|psychology|proposal|degradation|overgraze|laser|allure|add up|linger|hang out|rush|ambience|like-minded'.split('|'),
};
const key = 'ielts-study-helper.words.v1';
const keyFor = book => `ielts-study-helper.cambridge${book}-imported.v1`;
const versionFor = book => `cambridge${book}-v1`;
const copy = value => JSON.parse(JSON.stringify(value));

function harness(initial = {}) {
  const storage = new Map(Object.entries(initial));
  let failWordsWrite = false;
  let id = 0;
  const writes = [];
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (name, value) => {
        if (name === key && failWordsWrite) throw new Error('quota exceeded');
        storage.set(name, String(value));
      },
      removeItem: name => storage.delete(name),
    },
    createId: () => `test-${++id}`,
    scheduleCloudSave() {}, setStatus() {},
    cacheCloudPayload() {}, renderLibrary() {}, renderWriting() {}, renderCloudState() {},
    setCloudStatus() { throw new Error('Unexpected cloud read failure'); },
    saveCloudNow: async () => { writes.push(copy(run('getCloudPayload()'))); },
  });
  const run = code => vm.runInContext(code, context);
  run(`${constants}\n${seeds}\n${functions}`);
  run(`var state = { words: [], writing: { sentinel: 'writing' }, speaking: { sentinel: 'speaking' }, cloudUser: { id: 'test' } };
    var cloudHydrating = false, wordsMigratedDuringHydration = false;
    var task1MigratedDuringHydration = false, task2MigratedDuringHydration = false;
    var speakingMigratedDuringHydration = false, categorySettingsChangedDuringHydration = false;
    var categorySettings = { sentinel: 'settings' }, categorySettingsUpdatedAt = 1;
    var WRITING_TASK1_SEED_KEY = 'task1', WRITING_TASK2_SEED_KEY = 'task2', SPEAKING_CARD_SEED_KEY = 'speaking';
    var CLOUD_TABLE = 'user_app_data';`);
  return { run, context, storage, writes, failWrites: value => { failWordsWrite = value; } };
}

async function testImports() {
  const h = harness();
  for (const book of [7, 8]) {
    const seed = copy(h.run(`CAMBRIDGE${book}_SEED`));
    assert.deepEqual(seed.map(x => x.word), expected[book]);
    assert.equal(new Set(seed.map(x => x.word.toLowerCase())).size, seed.length);
    for (const card of seed) {
      for (const field of ['word', 'phonetic', 'meaning', 'definition', 'collocations', 'synonyms', 'examples']) {
        assert.ok(typeof card[field] === 'string' && card[field].trim(), `${card.word}: ${field}`);
      }
      assert.equal(card.examples.split('\n').length, 2, card.word);
    }
  }
  const original = { id: 'existing', word: '  Scrutiny  ', createdAt: Date.now() + 100000, star: 5, meaning: 'My translation', definition: 'My definition', collocations: 'custom', examples: 'custom example', synonyms: 'custom' };
  const user = harness({ [key]: JSON.stringify([original]), [keyFor(5)]: '1', [keyFor(6)]: versionFor(6), writing: 'unchanged', speaking: 'unchanged' });
  const loaded = copy(user.run('loadSavedWords()'));
  assert.deepEqual(loaded[0], original);
  const expectedAdded = [...new Set([...expected[7], ...expected[8]].map(x => x.toLowerCase()))].filter(x => x !== 'scrutiny');
  assert.deepEqual(loaded.slice(1).map(x => x.word.toLowerCase()), expectedAdded);
  assert.deepEqual(copy(user.run('loadSavedWords()')), loaded, 'reload must not import twice');
  assert.deepEqual([...loaded].sort((a, b) => a.createdAt - b.createdAt), loaded, 'saved ordering must follow book 7 then 8');
  assert.equal(user.storage.get('writing'), 'unchanged');
  assert.equal(user.storage.get('speaking'), 'unchanged');
  for (const book of [7, 8]) assert.equal(user.storage.get(keyFor(book)), versionFor(book));
  const reduced = loaded.filter(x => x.word !== 'timekeeping');
  user.storage.set(key, JSON.stringify(reduced));
  assert.deepEqual(copy(user.run('loadSavedWords()')), reduced, 'deleted words must not return on reload');

  const quota = harness({ [key]: '[]', [keyFor(5)]: '1', [keyFor(6)]: versionFor(6) });
  quota.failWrites(true);
  quota.run('loadSavedWords()');
  assert.equal(quota.storage.get(keyFor(7)), undefined, 'failed writes must not advance the import version');
  assert.equal(quota.storage.get(keyFor(8)), undefined);
  quota.failWrites(false);
  assert.ok(quota.run('loadSavedWords().length') > 100, 'retry must persist the full import');
  const cloudQuota = harness();
  cloudQuota.failWrites(true);
  cloudQuota.run('applyCloudPayload({ words: [] })');
  assert.equal(cloudQuota.run('cloudHydrating'), false, 'storage failure must not leave hydration stuck');
  assert.equal(cloudQuota.storage.get(keyFor(7)), undefined);
  assert.equal(cloudQuota.storage.get(keyFor(8)), undefined);

  h.run('state.words = loadSavedWords()');
  const imported = copy(h.run('state.words'));
  const olderWords = copy(h.run('[...CAMBRIDGE5_SEED, ...CAMBRIDGE6_SEED]'));
  assert.equal(imported.length - new Set(olderWords.map(x => x.word.toLowerCase())).size, 132);
  assert.equal(imported.filter(x => x.word === 'pendulum').length, 1);
  assert.equal(imported.filter(x => x.word === 'dynamic').length, 1);
  assert.deepEqual([...imported].sort((a, b) => a.createdAt - b.createdAt), imported);

  // Exercise the same hydration and write-back functions as a real Supabase download.
  h.run('state.words.find(x => x.word === "timekeeping").meaning = "Local edit"');
  h.run('state.words.find(x => x.word === "timekeeping").star = 4');
  const cloudExisting = { ...original, word: 'scrutiny', meaning: 'Cloud edit' };
  const oldPayload = { words: [cloudExisting], cambridge6ImportVersion: versionFor(6) };
  h.context.supabaseClient = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payload: oldPayload }, error: null }) }) }) }) };
  await h.run('hydrateFromCloud()');
  assert.equal(h.writes.length, 1, 'old cloud versions must trigger automatic write-back');
  const uploaded = h.writes[0];
  assert.equal(uploaded.words[0].meaning, 'Cloud edit');
  assert.equal(uploaded.words[0].star, 5);
  assert.equal(uploaded.words.find(x => x.word === 'timekeeping').meaning, 'Local edit');
  assert.equal(uploaded.words.find(x => x.word === 'timekeeping').star, 4);
  for (const book of [7, 8]) assert.equal(uploaded[`cambridge${book}ImportVersion`], versionFor(book));
  assert.deepEqual(uploaded.writing, { sentinel: 'writing' });
  assert.deepEqual(uploaded.speaking, { sentinel: 'speaking' });
  assert.deepEqual(uploaded.categorySettings, { sentinel: 'settings' });
  assert.deepEqual([...uploaded.words].sort((a, b) => a.createdAt - b.createdAt), uploaded.words);

  const currentPayload = { ...uploaded, words: uploaded.words.filter(x => x.word !== 'timekeeping') };
  delete currentPayload.writing;
  delete currentPayload.speaking;
  delete currentPayload.categorySettings;
  h.context.currentPayload = currentPayload;
  h.run('applyCloudPayload(currentPayload)');
  assert.deepEqual(copy(h.run('state.words')), currentPayload.words, 'current cloud version must respect deletions and order');
  assert.deepEqual(copy(h.run('loadSavedWords()')), currentPayload.words);
  const device = harness();
  device.context.currentPayload = currentPayload;
  device.run('applyCloudPayload(currentPayload)');
  assert.deepEqual(copy(device.run('state.words')), currentPayload.words, 'second device restores current cloud words');
  console.log('PASS: document order, 76 + 67 entries, 132 additions to Cambridge 5/6, deduplication, fields, repeat loads, deletions, quota retry, user edits/stars, cloud upgrade/write-back/restore.');
}

async function testBrowser() {
  const { chromium } = require('playwright');
  const http = require('node:http');
  const os = require('node:os');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const url = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    // Existing modules normalise their first-run seed objects on the next load.
    await page.reload();
    const initial = await page.evaluate(() => state.words);
    assert.ok(initial.some(x => x.word === 'scrutiny'));
    assert.ok(initial.some(x => x.word === 'like-minded'));
    const otherModules = await page.evaluate(() => JSON.stringify({ writing: state.writing, speaking: state.speaking, categorySettings }));
    await page.locator('.nav-link[data-route="words"]').click();
    await page.locator('[data-word-view="library"]').click();
    for (const word of ['scrutiny', 'reserve a seat', 'timekeeping', 'hang out', 'like-minded']) {
      await page.locator('#search-input').fill(word);
      const row = page.locator('#library-list .library-row').first();
      await row.click();
      assert.equal(await page.locator('#detail-title').textContent(), word);
      for (const field of ['meaning', 'definition', 'collocations', 'synonyms', 'examples']) assert.ok(await page.locator(`#detail-${field}`).inputValue(), `${word}/${field}`);
      await page.keyboard.press('Escape');
    }
    await page.locator('#search-input').fill('scrutiny');
    await page.locator('#library-list .star-button').click();
    await page.locator('#library-list .library-row').click();
    await page.locator('#detail-meaning').fill('Edited translation');
    await page.locator('#detail-save').click();
    const saved = await page.evaluate(() => state.words);
    await page.reload();
    assert.deepEqual(await page.evaluate(() => state.words), saved);
    assert.equal(await page.evaluate(() => JSON.stringify({ writing: state.writing, speaking: state.speaking, categorySettings })), otherModules);
    await page.locator('.nav-link[data-route="words"]').click();
    await page.locator('[data-word-view="library"]').click();
    await page.locator('#search-input').fill('scrutiny');
    await page.locator('#library-list .library-row').click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'cambridge78-desktop.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#search-input').fill('like-minded');
    await page.locator('#library-list .library-row').click();
    assert.ok(await page.locator('#detail-meaning').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'cambridge78-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile word library, search, word/phrase cards, all fields, editing, stars, refresh, other modules unchanged, no page errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  await testImports();
  if (process.argv.includes('--browser')) await testBrowser();
})().catch(error => { console.error(error); process.exitCode = 1; });
