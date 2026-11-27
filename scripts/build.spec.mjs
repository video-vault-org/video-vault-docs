import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from './build.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://video-vault.de';
const paths = ['/de/', '/en/', '/de/security.html', '/en/security.html'];
let root;
let output;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'vault-docs-seo-'));
  for (const name of ['index.html', 'SECURITY-ARCHITECTURE.html', 'styles.css', 'favicon.ico', 'security-navigation.js', 'assets'])
    await cp(join(project, name), join(root, name), { recursive: true });
  output = join(root, 'dist');
  await build({ root });
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const filename = function (path) {
  return join(output, path.endsWith('/') ? `${path}index.html` : path);
};

const attribute = function (html, selector, name) {
  const tag = html.match(selector)?.[0];
  assert(tag, String(selector));
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
};

test('publishes one complete language per URL with descriptive language-specific metadata and reciprocal alternates', async () => {
  for (const path of paths) {
    const html = await readFile(filename(path), 'utf8');
    const language = path.split('/')[1];
    const other = language === 'de' ? 'en' : 'de';
    assert.match(html, new RegExp(`<html lang="${language}"`));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal(attribute(html, /<link\b[^>]*rel="canonical"[^>]*>/, 'href'), origin + path);
    for (const value of ['de', 'en', 'x-default']) {
      const destination = path.replace(`/${language}/`, `/${value === 'x-default' ? 'de' : value}/`);
      assert.equal(attribute(html, new RegExp(`<link\\b[^>]*hreflang="${value}"[^>]*>`), 'href'), origin + destination);
    }
    assert(!html.includes(`id="panel-${other}"`));
    assert(!html.includes(`id="${other}"`));
    assert(!html.includes('role="tabpanel"'));
    assert(!html.includes('role="tablist"'));
    assert(!html.includes('navigator.language'));
    assert(!html.includes('src="language.js"'));
    assert.match(html, language === 'de' ? /<title>VideoVault.*(?:Verschlüssel|verschlüssel)/ : /<title>VideoVault.*(?:Encrypted|Encryption)/);
    const description = attribute(html, /<meta\b[^>]*name="description"[^>]*>/, 'content');
    assert(description.length > 60);
    assert(!description.includes('Deutsch / English'));
    assert.equal((html.match(/<meta\b[^>]*name="description"/g) ?? []).length, 1);
    assert.match(html, new RegExp(`hreflang="${other}"`));
    assert(!/<(?:main|div)[^>]*\shidden(?:\s|>)/.test(html));
    if (path.endsWith('security.html')) {
      assert.match(html, language === 'de' ? /Zum Löschen deines eigenen Kontos/ : /Deleting your own account requires/);
      assert.equal((html.match(/<svg\b/g) ?? []).length, 4);
    } else {
      assert.match(html, /Coming soon/);
      assert.match(html, /https:\/\/demo\.video-vault\.de/);
      assert.match(html, /href="security.html"/);
    }
  }
});

test('adds complete static Open Graph tags and real, absolute image dimensions on all four pages', async () => {
  const image = await readFile(join(output, 'assets/og-logo.png'));
  for (const path of paths) {
    const html = await readFile(filename(path), 'utf8');
    const value = (property) => attribute(html, new RegExp(`<meta\\b[^>]*property="og:${property}"[^>]*>`), 'content');
    assert.equal(value('type'), 'website');
    assert.equal(value('site_name'), 'VideoVault');
    assert.equal(value('url'), origin + path);
    assert.equal(value('image'), `${origin}/assets/og-logo.png`);
    assert.equal(value('image:type'), 'image/png');
    assert.equal(Number(value('image:width')), image.readUInt32BE(16));
    assert.equal(Number(value('image:height')), image.readUInt32BE(20));
    assert(image.readUInt32BE(16) >= 200);
    assert(value('image:alt').length > 0);
    assert.equal(value('description'), attribute(html, /<meta\b[^>]*name="description"[^>]*>/, 'content'));
    assert.equal(value('title'), html.match(/<title>(.*?)<\/title>/)[1]);
    assert.equal(value('locale'), path.startsWith('/de/') ? 'de_DE' : 'en_US');
  }
});

test('keeps all local navigation, section anchors, screenshots, styles and favicons resolvable', async () => {
  for (const path of paths) {
    const html = await readFile(filename(path), 'utf8');
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const target = new URL(match[1], origin + path);
      if (target.origin !== origin) continue;
      const destination = filename(target.pathname);
      assert((await stat(destination)).isFile(), `${path}: ${match[1]}`);
      if (target.hash) {
        const content = await readFile(destination, 'utf8');
        assert(content.includes(`id="${target.hash.slice(1)}"`), `${path}: missing ${match[1]}`);
      }
    }
  }
});

test('sitemap lists only the four canonical pages and robots.txt announces it', async () => {
  const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls.sort(), paths.map((path) => origin + path).sort());
  assert.equal(await readFile(join(output, 'robots.txt'), 'utf8'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  for (const path of paths) assert(!/<meta[^>]*name="robots"[^>]*content="noindex/.test(await readFile(filename(path), 'utf8')));
  assert.match(await readFile(join(output, '404.html'), 'utf8'), /name="robots" content="noindex"/);
});

test('Amplify rules preserve old addresses, normalize duplicates and use a real 404 instead of an SPA fallback', async () => {
  const rules = JSON.parse(await readFile(join(project, 'amplify-redirects.json'), 'utf8'));
  assert.deepEqual(rules.at(-1), { source: '/<*>', target: '/404.html', status: '404', condition: null });
  for (const [source, target] of [
    ['/', '/de/'],
    ['/index.html', '/de/'],
    ['/SECURITY-ARCHITECTURE.html', '/de/security.html'],
    ['/de/index.html', '/de/'],
    ['/en/index.html', '/en/']
  ]) {
    assert(rules.some((rule) => rule.source === source && rule.target === target && rule.status === '301'));
  }
  for (const rule of rules) {
    assert.notEqual(rule.source, rule.target);
    assert.notEqual(rule.status, '200');
    if (rule.target.startsWith('/')) {
      assert((await stat(filename(rule.target))).isFile());
      assert(!rules.some((next) => next.source === rule.target && next.status === '301'), `Redirect chain: ${rule.source}`);
    }
  }
});

test('the security language switch preserves the selected section, including legacy English fragment links', async () => {
  const script = await readFile(join(output, 'security-navigation.js'), 'utf8');
  let href, replaced, listener;
  const context = {
    document: {
      documentElement: { lang: 'de' },
      querySelector: () => ({
        setAttribute: (_name, value) => {
          href = value;
        }
      })
    },
    location: {
      hash: '#de-login',
      replace: (value) => {
        replaced = value;
      }
    },
    window: {
      addEventListener: (_name, handler) => {
        listener = handler;
      }
    }
  };
  runInNewContext(script, context);
  assert.equal(href, '../en/security.html#en-login');
  context.location.hash = '#de-files';
  listener();
  assert.equal(href, '../en/security.html#en-files');
  context.location.hash = '#en-keys';
  listener();
  assert.equal(replaced, '../en/security.html#en-keys');
});

test('missing language source content fails without deleting the last successful build', async () => {
  const source = await readFile(join(root, 'index.html'), 'utf8');
  await writeFile(join(root, 'index.html'), source.replace('id="en"', 'id="missing"'));
  try {
    await assert.rejects(build({ root }), /Missing source element/);
    assert((await readFile(join(output, 'en/index.html'), 'utf8')).includes('<html lang="en"'));
  } finally {
    await writeFile(join(root, 'index.html'), source);
  }
});
