// Golden-snapshot corpus harness for dexplain.
// Discovers corpus entries at test time by scanning test/corpus/*/Dockerfile.
// For each entry, parses with parseDockerfile and runs all applicable rules via runRules.
// Each finding is projected to {ruleId, line, severity, fixRisk, title} and sorted by
// (line, ruleId, title), then compared deep-equal against findings.json.
//
// Environment:
// - UPDATE_CORPUS=1: write/overwrite all snapshots instead of asserting
// - UPDATE_CORPUS=<comma,separated,slugs>: update only specified entries
//
// Snapshot update mode logs which files were written and the test passes.
// Missing snapshots fail with "missing snapshot for <slug>" guidance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import { runRules } from '../lib/rules/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus');

// Parse UPDATE_CORPUS environment variable
const updateMode = process.env.UPDATE_CORPUS;
const updateAll = updateMode === '1';
const updateSlugs = updateMode && updateMode !== '1'
  ? new Set(updateMode.split(',').map((s) => s.trim()))
  : new Set();

// Project a finding to the snapshot format: {ruleId, line, severity, fixRisk, title}.
// Line is finding.location?.line ?? null.
function projectFinding(finding) {
  return {
    ruleId: finding.ruleId,
    line: finding.location?.line ?? null,
    severity: finding.severity,
    fixRisk: finding.fixRisk,
    title: finding.title,
  };
}

// Sort snapshot findings by (line ?? -1, ruleId, title).
function sortFindings(findings) {
  return findings.sort((a, b) => {
    const aLine = a.line ?? -1;
    const bLine = b.line ?? -1;
    if (aLine !== bLine) return aLine - bLine;
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    return a.title.localeCompare(b.title);
  });
}

// Discover corpus entries by scanning test/corpus/*/Dockerfile.
// Returns array of {slug, dockerfilePath}.
function discoverCorpus() {
  const entries = [];
  const dirs = fs.readdirSync(CORPUS_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dockerfilePath = path.join(CORPUS_DIR, dir.name, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      entries.push({ slug: dir.name, dockerfilePath });
    }
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

// Generate snapshot for a corpus entry by parsing and running rules.
function generateSnapshot(dockerfilePath) {
  const text = fs.readFileSync(dockerfilePath, 'utf-8');
  const dockerfile = parseDockerfile(text, dockerfilePath);
  const { findings } = runRules({ dockerfile });
  return sortFindings(findings.map(projectFinding));
}

// Compare snapshots with readable diff on mismatch.
function assertSnapshotMatch(actual, expected, slug) {
  try {
    assert.deepEqual(actual, expected);
  } catch (error) {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    throw new Error(
      `snapshot mismatch for "${slug}":\n\nExpected:\n${expectedStr}\n\nActual:\n${actualStr}`
    );
  }
}

// Discover and test all corpus entries
const corpusEntries = discoverCorpus();

if (corpusEntries.length === 0) {
  test('corpus: no entries discovered (this is OK if this is the first run)', () => {
    // Pass silently
  });
} else {
  for (const { slug, dockerfilePath } of corpusEntries) {
    test(`corpus: ${slug}`, () => {
      const actual = generateSnapshot(dockerfilePath);
      const snapshotPath = path.join(CORPUS_DIR, slug, 'findings.json');

      if (updateAll || updateSlugs.has(slug)) {
        // Update mode: write snapshot
        const content = JSON.stringify(actual, null, 2) + '\n';
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(snapshotPath, content, 'utf-8');
        console.log(`  [UPDATE] ${slug}: wrote findings.json`);
        return; // Test passes in update mode
      }

      if (!fs.existsSync(snapshotPath)) {
        throw new Error(
          `missing snapshot for "${slug}" — ` +
          `run UPDATE_CORPUS=1 node --test test/corpus.test.mjs`
        );
      }

      const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
      assertSnapshotMatch(actual, expected, slug);
    });
  }
}

// Report update mode completion
if (updateAll || updateSlugs.size > 0) {
  const updated = updateAll
    ? corpusEntries.map((e) => e.slug)
    : Array.from(updateSlugs);
  console.log(`\n[UPDATE] wrote ${updated.length} snapshot(s): ${updated.join(', ')}`);
}
