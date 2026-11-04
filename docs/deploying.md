# Deploying

`npm run build` writes the site to `dist/` and refreshes `asset-manifest.json`, which the service worker uses to cache the app for offline use. Publish the contents of `dist/` on any static host that serves over HTTPS, and turn on gzip or brotli: the first load is about 160 KB compressed and about 490 KB raw.

The repository root is not the site root. Hosts that default to a folder named `public` will serve only the fonts and icons and answer 404 at `/`, so set the output directory to `dist`.

- **Vercel:** `vercel.json` already sets the build command, the output directory and the security headers.
- **Netlify or Cloudflare Pages:** build command `npm run build`, publish directory `dist`. The headers in `_headers` use their format.
- **Anything else:** send the headers listed in `vercel.json`. Browsers ignore `frame-ancestors` in a meta tag, so it must come from the host.

Remove the old prototype files (`js/`, `vendor/`, and any fonts in `public/fonts/` other than the Atkinson Hyperlegible Next and Commit Mono files). Everything under `public/` is cached by the service worker, so leftovers are downloaded for nothing.
