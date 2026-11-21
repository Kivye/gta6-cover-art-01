// VICEFRAME hand-in program.
// Copies app/ and screenshots/ into the output directory, then writes the
// dossier with the kit's own library so the grader's rebuild matches byte
// for byte. Standard library only; the output starts empty on every run so
// two runs of this program produce exactly the same bytes.

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'app'), join(outDir, 'app'), { recursive: true });
cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// One compact log line per hand-in: shot count and dossier size, so a CI
// log alone shows what was handed in without opening the output folder.
const shotCount = readdirSync(join(outDir, 'screenshots')).length;
console.log(`viceframe hand-in: ${shotCount} screenshots, dossier ${Buffer.byteLength(dossier)} bytes -> ${outDir}`);
