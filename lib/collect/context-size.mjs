import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CONTEXT_SCAN_MAX_ENTRIES, DEFAULT_DOCKERFILE } from '../constants.mjs';
import { makeDockerignoreMatcher, readDockerignore } from './dockerignore.mjs';

/**
 * Measures the size of the build context Docker would actually upload — the on-disk
 * tree minus anything .dockerignore excludes. Symlinks are counted as one file entry
 * with zero bytes and not descended into. The Dockerfile and .dockerignore are always
 * counted even if patterns would otherwise exclude them (Docker always uploads both).
 */
export function measureContext(contextDir) {
  const patterns = readDockerignore(contextDir);
  const matcher = makeDockerignoreMatcher(patterns);
  let totalBytes = 0;
  let fileCount = 0;
  let truncated = false;
  const alreadyCounted = new Set();
  const stack = [contextDir];

  while (stack.length && !truncated) {
    const entries = readEntries(stack.pop());
    for (const { dir, entry } of entries) {
      if (fileCount >= CONTEXT_SCAN_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const full = join(dir, entry.name);
      const rel = toPosixRelative(contextDir, full);

      if (entry.isSymbolicLink()) {
        fileCount += 1;
        alreadyCounted.add(rel);
        continue;
      }

      if (matcher.ignores(rel)) {
        if (entry.isDirectory() && matcher.canPruneDir(rel)) {
          continue;
        }
        if (!entry.isDirectory()) continue;
      }

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        totalBytes += fileSize(full);
        fileCount += 1;
        alreadyCounted.add(rel);
      }
    }
  }

  ensureAlwaysSent(contextDir, alreadyCounted, (bytes) => {
    totalBytes += bytes;
    if (bytes > 0) fileCount += 1;
  });

  return { totalBytes, fileCount, truncated, hasDockerignore: patterns.length > 0 };
}

function toPosixRelative(contextDir, full) {
  return relative(contextDir, full).split(sep).join('/');
}

function readEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((entry) => ({ dir, entry }));
  } catch {
    return [];
  }
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function ensureAlwaysSent(contextDir, alreadyCounted, addToTotal) {
  const always = ['.dockerignore', DEFAULT_DOCKERFILE];
  for (const name of always) {
    if (alreadyCounted.has(name)) continue;
    const path = join(contextDir, name);
    const bytes = fileSize(path);
    if (bytes >= 0) {
      addToTotal(bytes);
      alreadyCounted.add(name);
    }
  }
}

export function resolveDockerfilePath(file, contextDir) {
  return file ?? join(contextDir, DEFAULT_DOCKERFILE);
}
