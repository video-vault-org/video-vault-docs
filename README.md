# VideoVault – Documentation website

Product presentation and security architecture for [video-vault.de](https://video-vault.de), in German and English.

## Build and test

Requires Node.js 22 or later. The build and tests use only Node.js built-ins; no npm packages need to be installed.

```sh
npm test
npm run build
```

Publish **only `dist/`**, which contains these static, independently readable pages:

| German              | English             |
|---------------------|---------------------|
| `/de/`              | `/en/`              |
| `/de/security.html` | `/en/security.html` |

Each page contains its own language's complete text, localized title and description, canonical URL, reciprocal `hreflang` links and Open Graph metadata. Language selection uses ordinary links and works without JavaScript. The security page additionally preserves section anchors when switching languages. Pages do not redirect based on browser language.

`dist/sitemap.xml` lists the four canonical pages; `dist/robots.txt` points crawlers to it. The Open Graph image is the existing VideoVault logo in `assets/og-logo-compact.png` (715 × 715 pixels, optimized PNG under 200 KB). The distinct image filename avoids reusing the previous image URL. Image URLs are absolute HTTPS URLs.

For a local preview:

```sh
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080/de/` or `http://localhost:8080/en/`. This simple server does not apply Amplify's HTTP redirect rules; the two legacy HTML files also contain fallback redirects.

## Editing content

- Edit `index.html` for the product presentation and `SECURITY-ARCHITECTURE.html` for the security architecture. Both remain bilingual, standalone source documents with their existing language switches.
- Keep German and English content consistent. Preserve the source language containers used by the build.
- Edit `styles.css` and `assets/` for shared styling and images.
- SEO titles, descriptions and the production origin (`https://video-vault.de`) are defined in `scripts/build.mjs`. Update redirect domains too if the public domain changes.
- Run tests and rebuild after edits. Do not edit `dist/` manually; it is regenerated and excluded from Git.

## AWS Amplify Hosting

Connect this repository and branch to Amplify Hosting. The included `amplify.yml` runs tests, builds the site and publishes `dist/`. Use Node.js 22 or newer in the Amplify build environment. No backend or runtime server is required.

**One-time hosting setup:** open the app's **Hosting → Rewrites and redirects** settings, open the JSON editor and import `amplify-redirects.json`. These rules are configured separately from the build specification: committing `amplify.yml` alone does not install them. Remove any previous SPA catch-all rewrite to `/index.html`; it would turn unknown URLs into successful HTML responses. Review existing custom rules before replacing them.

Alternatively, with AWS CLI credentials authorized to update the Amplify app:

```sh
aws amplify update-app --app-id YOUR_APP_ID --custom-rules file://amplify-redirects.json
```

The JSON defines permanent HTTP 301 redirects from `/` and `/index.html` to `/de/`, and from `/SECURITY-ARCHITECTURE.html` to `/de/security.html`. It also normalizes explicit `index.html` and slash-less language URLs. Existing English security section fragments are carried through the redirect and resolved to the English page by the small navigation script. Unknown paths use `404.html` with status 404 instead of an SPA fallback.

Configure the custom domain `video-vault.de` and HTTPS in Amplify. If `www.video-vault.de` is attached too, the included domain rule permanently redirects it to the non-www domain while preserving paths. DNS and certificates must cover both names for that redirect to be reachable.

After deployment, verify the redirects and publicly accessible `robots.txt`, `sitemap.xml` and `/assets/og-logo-compact.png`. You can then submit `https://video-vault.de/sitemap.xml` to Google Search Console. Search indexing and link-preview refreshes are controlled by the respective crawlers and are not immediate.
