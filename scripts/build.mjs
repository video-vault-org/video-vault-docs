import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://video-vault.de';
const languages = ['de', 'en'];
const pages = {
  home: {
    file: 'index.html',
    path: '',
    de: {
      title: 'VideoVault – Verschlüsseltes Videoarchiv für Familie und Freunde',
      description:
        'Private Videos mit Familie und Freunden teilen: VideoVault bietet Ende-zu-Ende-Verschlüsselung, ein selbst betriebenes Videoarchiv, Kommentare und einen Offline-Katalog.'
    },
    en: {
      title: 'VideoVault – Encrypted video library for family and friends',
      description:
        'Share private videos with family and friends. VideoVault is a self-hosted, end-to-end encrypted video library with comments and an offline catalog.'
    }
  },
  security: {
    file: 'security.html',
    path: 'security.html',
    de: {
      title: 'VideoVault Sicherheitsarchitektur – Verschlüsselung und Kontoschutz',
      description:
        'So schützt VideoVault private Videos: lokale Verschlüsselung, Passwort- und Schlüsselableitung, sichere Sitzungen und die Grenzen des gemeinsamen Videoarchivs.'
    },
    en: {
      title: 'VideoVault security architecture – Encryption and account protection',
      description:
        'How VideoVault protects private videos: client-side encryption, password and key derivation, secure sessions, and the limits of a shared video library.'
    }
  }
};

const escape = function (value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
};

/** Extracts a known source element without rewriting its HTML/SVG contents. Missing/unbalanced source markers fail the build. */
const element = function (source, opening, tag) {
  const match = opening.exec(source);
  if (!match) throw new Error(`Missing source element: ${opening}`);
  const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokens.lastIndex = match.index;
  let depth = 0;
  let token;
  while ((token = tokens.exec(source))) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(match.index, tokens.lastIndex);
  }
  throw new Error(`Unbalanced source element: ${opening}`);
};

const url = function (language, page) {
  return `${origin}/${language}/${pages[page].path}`;
};

const metadata = function (language, page, width, height) {
  const { title, description } = pages[page][language];
  const other = language === 'de' ? 'en' : 'de';
  return `    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    <link rel="canonical" href="${url(language, page)}" />
    <link rel="alternate" hreflang="de" href="${url('de', page)}" />
    <link rel="alternate" hreflang="en" href="${url('en', page)}" />
    <link rel="alternate" hreflang="x-default" href="${url('de', page)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="VideoVault" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:url" content="${url(language, page)}" />
    <meta property="og:locale" content="${language === 'de' ? 'de_DE' : 'en_US'}" />
    <meta property="og:locale:alternate" content="${other === 'de' ? 'de_DE' : 'en_US'}" />
    <meta property="og:image" content="${origin}/assets/og-logo.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${width}" />
    <meta property="og:image:height" content="${height}" />
    <meta property="og:image:alt" content="${language === 'de' ? 'VideoVault-Logo: Video mit Vorhängeschloss' : 'VideoVault logo: video with a padlock'}" />`;
};

const resourcePaths = function (html) {
  return html.replace(/(href|src)="(assets\/[^"\n]+|favicon\.ico|styles\.css)"/g, '$1="../$2"');
};

const navigation = function (language, page, className) {
  return `<nav class="${className}" aria-label="${language === 'de' ? 'Sprache' : 'Language'}">${languages.map((value) => `<a href="${value === language ? '' : `../${value}/`}${pages[page].file}" lang="${value}" hreflang="${value}"${value === language ? ' aria-current="page"' : ''}>${value === 'de' ? 'Deutsch' : 'English'}</a>`).join('')}</nav>`;
};

const head = function (source, language, page, width, height) {
  const match = /<head>([\s\S]*?)<\/head>/.exec(source);
  if (!match) throw new Error('Missing head');
  const common = match[1]
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<meta\b(?=[^>]*\bname="description")[^>]*>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  // noinspection HtmlRequiredTitleElement
  return `<head>${resourcePaths(common)}\n${metadata(language, page, width, height)}\n  </head>`;
};

const home = function (source, language, width, height) {
  const content = element(source, new RegExp(`<main\\b[^>]*\\bid="${language}"[^>]*>`), 'main').replace(
    / data-content-language="[^"]+"| hidden(?=[\s>])/g,
    ''
  );
  const header = element(source, /<header\b[^>]*class="site-header"[^>]*>/, 'header').replace(
    element(source, /<div\b[^>]*class="languages"[^>]*>/, 'div'),
    navigation(language, 'home', 'languages')
  );
  const footer = element(source, /<footer\b[^>]*>/, 'footer').replace(
    /(<a[^>]*data-footer-security[^>]*>)[\s\S]*?(<\/a>)/,
    `$1${language === 'de' ? 'Sicherheitsarchitektur' : 'Security architecture'}$2`
  );
  const body = resourcePaths(`${header}\n${content}\n${footer}`)
    .replaceAll('href="SECURITY-ARCHITECTURE.html"', 'href="security.html"')
    .replaceAll('href="./"', 'href="index.html"');
  return `<!doctype html>\n<html lang="${language}" prefix="og: https://ogp.me/ns#">\n  ${head(source, language, 'home', width, height)}\n<body>\n${body}\n</body>\n</html>\n`;
};

const security = function (source, language, width, height) {
  const header = element(source, new RegExp(`<div\\b[^>]*data-header-lang="${language}"[^>]*>`), 'div').replace(
    / data-header-lang="[^"]+"| hidden(?=[\s>])/g,
    ''
  );
  const panel = element(source, new RegExp(`<div\\b[^>]*\\bid="panel-${language}"[^>]*>`), 'div').replace(
    / role="tabpanel"| aria-labelledby="tab-[^"]+"| hidden(?=[\s>])/g,
    ''
  );
  const styles = `<style>
.tabs a {display:inline-block;font:inherit;border:1px solid #c3d5d8;border-radius:8px;background:#fff;color:var(--ink);padding:8px 22px;text-decoration:none}
.tabs a[aria-current="page"] {color:#fff;background:var(--accent);border-color:var(--accent)}
@media print {.tabs {display:none}}
</style>`;
  return `<!doctype html>\n<html lang="${language}" prefix="og: https://ogp.me/ns#">\n${head(source, language, 'security', width, height)}\n<body>
<header><div class="eyebrow">VideoVault / ${language === 'de' ? 'Sicherheit' : 'Security'}</div>${header}</header>
${navigation(language, 'security', 'tabs')}
${styles}
<main>${panel}</main>
<footer class="foot" style="padding:24px;text-align:center"><a href="index.html">${language === 'de' ? 'Zur VideoVault-Startseite' : 'VideoVault home'}</a></footer>
<script src="../security-navigation.js" defer></script>
</body>\n</html>\n`;
};

/** Generates only deployable files. The bilingual source documents remain editable and usable offline. */
const build = async function ({ root = defaultRoot, output = join(root, 'dist') } = {}) {
  root = resolve(root);
  output = resolve(output);
  if (output !== join(root, 'dist')) throw new Error('Build output must be the project dist directory');
  const [homeSource, securitySource, css, logo] = await Promise.all([
    readFile(join(root, 'index.html'), 'utf8'),
    readFile(join(root, 'SECURITY-ARCHITECTURE.html'), 'utf8'),
    readFile(join(root, 'styles.css'), 'utf8'),
    readFile(join(root, 'assets/og-logo.png'))
  ]);
  if (logo.length < 24 || logo.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('OG logo must be a PNG');
  const width = logo.readUInt32BE(16),
    height = logo.readUInt32BE(20);
  const rendered = [];
  for (const language of languages) {
    rendered.push([`${language}/index.html`, home(homeSource, language, width, height)]);
    rendered.push([`${language}/security.html`, security(securitySource, language, width, height)]);
  }
  const redirectPage = (target) =>
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VideoVault</title><link rel="canonical" href="${origin}${target}"><meta http-equiv="refresh" content="0;url=.${target}"></head><body><p><a href=".${target}">VideoVault · Deutsch</a> · <a href=".${target.replace('/de/', '/en/')}">English</a></p></body></html>\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${languages.flatMap((language) => Object.keys(pages).map((page) => `  <url><loc>${url(language, page)}</loc></url>`)).join('\n')}\n</urlset>\n`;
  const languageCss =
    css
      .replaceAll('.languages button {', '.languages button, .languages a {')
      .replaceAll('.languages button[aria-pressed="true"] {', '.languages button[aria-pressed="true"], .languages a[aria-current="page"] {') +
    '\n.languages a {display:inline-block;text-decoration:none}\n';
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
  await cp(join(root, 'favicon.ico'), join(output, 'favicon.ico'));
  await cp(join(root, 'security-navigation.js'), join(output, 'security-navigation.js'));
  await writeFile(join(output, 'styles.css'), languageCss);
  for (const [name, html] of rendered) {
    await mkdir(dirname(join(output, name)), { recursive: true });
    await writeFile(join(output, name), html);
  }
  await writeFile(join(output, 'index.html'), redirectPage('/de/'));
  await writeFile(join(output, 'SECURITY-ARCHITECTURE.html'), redirectPage('/de/security.html'));
  await writeFile(
    join(output, '404.html'),
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>VideoVault – Seite nicht gefunden / Page not found</title></head><body><h1>Seite nicht gefunden / Page not found</h1><a href="/de/">Deutsch</a> · <a href="/en/">English</a></body></html>\n'
  );
  await writeFile(join(output, 'sitemap.xml'), sitemap);
  await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();

export { build };
