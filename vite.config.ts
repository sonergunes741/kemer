import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  dependencies: Record<string, string>;
};

/**
 * Content Security Policy for the shipped build. The game is fully self-contained: no network,
 * no inline scripts or styles, no eval. Dev mode is exempt because Vite injects style tags.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'kemer-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

const HEADERS_FILE = '_headers';
const LICENSE_NAME = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/**
 * Response headers for static hosts that read a `_headers` file (Netlify, Cloudflare Pages): the
 * same CSP as the meta tag plus the headers a meta tag cannot set. Embedding stays allowed, since
 * game portals show the game in an iframe. Hosts that ignore the file (itch.io) are unaffected.
 */
function staticHeaders(): Plugin {
  return {
    name: 'kemer-headers',
    apply: 'build',
    generateBundle() {
      const source = [
        '/*',
        `  Content-Security-Policy: ${CSP}`,
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: no-referrer',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
        '  Cross-Origin-Opener-Policy: same-origin',
        '/',
        '  Cache-Control: no-cache',
        '/index.html',
        '  Cache-Control: no-cache',
        '/sw.js',
        '  Cache-Control: no-cache',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: HEADERS_FILE, source });
    },
  };
}

/**
 * Writes third-party-licenses.txt into the build: the licence text of every runtime dependency
 * that ships in the bundle (MIT, Zlib, and the SIL Open Font License for the fonts). The build
 * fails if a dependency has no licence file, so nothing ships without its notice.
 */
function thirdPartyLicenses(): Plugin {
  return {
    name: 'kemer-licenses',
    apply: 'build',
    generateBundle() {
      const sections: string[] = [];
      for (const name of Object.keys(pkg.dependencies).sort()) {
        const dir = fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));
        const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
          version?: string;
          license?: string;
          homepage?: string;
        };
        const file = readdirSync(dir).find((f) => LICENSE_NAME.test(f));
        if (!file) {
          this.error(`kemer-licenses: ${name} has no licence file`);
          return;
        }
        const head = [`${name} ${meta.version ?? ''}`.trim(), `License: ${meta.license ?? 'see below'}`];
        if (meta.homepage) head.push(meta.homepage);
        sections.push(`${head.join('\n')}\n\n${readFileSync(join(dir, file), 'utf8').trim()}\n`);
      }
      const rule = `\n${'-'.repeat(78)}\n\n`;
      const intro = `Kemer ${pkg.version} includes the following third-party software and fonts.\n`;
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: `${intro}${rule}${sections.join(rule)}` });
    },
  };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Writes dist/sw.js after the build: precaches every emitted file so the game plays offline.
 * The cache name includes the registration scope and a content hash, so each new build replaces
 * this install's previous cache and leaves other installs on the origin alone.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'kemer-sw',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        // _headers is read by the host and never served, so precaching it would fail the install.
        .filter((f) => f !== 'sw.js' && f !== HEADERS_FILE && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 12)}`;
      const precache = ['./', ...files.map((f) => `./${f}`)];
      const template = readFileSync(new URL('./scripts/sw.template.js', import.meta.url), 'utf8');
      const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the build runs from any folder (itch.io, portals, file servers, Tauri).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [contentSecurityPolicy(), staticHeaders(), thirdPartyLicenses(), serviceWorker()],
  optimizeDeps: {
    // Pre-bundle up front so adding an addon import mid-session does not force a re-optimise.
    include: [
      'three',
      'three/addons/loaders/GLTFLoader.js',
      '@dimforge/rapier3d-compat',
      'postprocessing',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/utils/BufferGeometryUtils.js',
      'three/addons/lines/Line2.js',
      'three/addons/lines/LineMaterial.js',
      'three/addons/lines/LineGeometry.js',
      'three/addons/lines/LineSegments2.js',
      'three/addons/lines/LineSegmentsGeometry.js',
      'three/addons/math/SimplexNoise.js',
      'three/addons/math/ImprovedNoise.js',
      'three/addons/geometries/RoundedBoxGeometry.js',
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1600,
    reportCompressedSize: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
