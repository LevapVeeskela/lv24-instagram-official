#!/usr/bin/env node
// Builds the GitHub Packages mirror. GitHub Packages requires the package
// scope to match the repository owner, so @lv24/<name> is published as
// @levapveeskela/<name>. Nothing in the source tree is modified.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const expected = process.env.VERSION;
if (expected && pkg.version !== expected) {
  throw new Error(`package.json version ${pkg.version} does not match requested ${expected}`);
}

const out = path.join(root, 'gh-package');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });
await cp(path.join(root, 'README.md'), path.join(out, 'README.md'));
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));

pkg.name = pkg.name.replace(/^@lv24\//, '@levapveeskela/');
pkg.repository = { type: 'git', url: 'https://github.com/LevapVeeskela/lv24-instagram-official.git' };
pkg.homepage = 'https://github.com/LevapVeeskela/lv24-instagram-official#readme';
pkg.bugs = { url: 'https://github.com/LevapVeeskela/lv24-instagram-official/issues' };
pkg.publishConfig = { registry: 'https://npm.pkg.github.com', access: 'public' };
delete pkg.devDependencies;
delete pkg.scripts;

if (pkg.dependencies?.['@lv24/kernel']) {
  pkg.dependencies['@levapveeskela/kernel'] = pkg.dependencies['@lv24/kernel'];
  delete pkg.dependencies['@lv24/kernel'];
  const rewrite = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await rewrite(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
        const text = await readFile(full, 'utf8');
        if (text.includes('@lv24/kernel')) {
          await writeFile(full, text.replaceAll('@lv24/kernel', '@levapveeskela/kernel'));
        }
      }
    }
  };
  await rewrite(path.join(out, 'dist'));
}

await writeFile(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`prepared ${pkg.name}@${pkg.version} in gh-package/`);
