#!/usr/bin/env node
/**
 * Locale parity check: every locale module must export the exact same key sets
 * as English (dict, wmo, warnings) and a 17-entry dirs array.
 *
 * Run: npx tsx scripts/check-locales.mjs   (tsx because locales are .ts)
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.join(process.cwd(), 'src/i18n/locales');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
const ref = await import(pathToFileURL(path.join(dir, 'en.ts')));

let failed = false;
for (const file of files) {
  const lang = file.replace(/\.ts$/, '');
  const mod = await import(pathToFileURL(path.join(dir, file)));
  const problems = [];
  for (const part of ['dict', 'wmo', 'warnings']) {
    const refKeys = new Set(Object.keys(ref[part]));
    const keys = new Set(Object.keys(mod[part] ?? {}));
    const missing = [...refKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !refKeys.has(k));
    if (missing.length) problems.push(`${part}: missing ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
    if (extra.length) problems.push(`${part}: extra ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '…' : ''}`);
  }
  if ((mod.dirs ?? []).length !== 17) problems.push(`dirs: ${mod.dirs?.length ?? 0} entries (want 17)`);
  const empty = Object.entries(mod.dict ?? {}).filter(([, v]) => !String(v).trim());
  if (empty.length) problems.push(`dict: ${empty.length} empty values`);

  if (problems.length) {
    failed = true;
    console.error(`✗ ${lang}: ${problems.join(' | ')}`);
  } else {
    console.log(`✓ ${lang} (${Object.keys(mod.dict).length} keys)`);
  }
}
process.exit(failed ? 1 : 0);
