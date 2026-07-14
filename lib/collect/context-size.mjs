import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CONTEXT_SCAN_MAX_ENTRIES, DEFAULT_DOCKERFILE } from '../constants.mjs';
import { makeDockerignoreMatcher, readDockerignore } from './dockerignore.mjs';

/**
 * Measures the size of the build context Docker would actually upload — the on-disk
 * tree minus anything .dockerignore excludes. Ignored directories are skipped whole, so
 * a heavy but ignored tree (node_modules, .git) costs nothing to measure.
 */
export function measureContext(contextDir) {
  const patterns = readDockerignore(contextDir);
  const ignored = makeDockerignoreMatcher(patterns);
  let totalBytes = 0;
  let fileCount = 0;
  let truncated = false;
  const stack = [contextDir];
  while (stack.length && !truncated) {
    const entries = readEntries(stack.pop());
    for (const { dir, entry } of entries) {
      if (fileCount >= CONTEXT_SCAN_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const full = join(dir, entry.name);
      if (ignored(toPosixRelative(contextDir, full))) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        totalBytes += fileSize(full);
        fileCount += 1;
      }
    }
  }
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

/** Resolves the Dockerfile path for a build, honouring an explicit `-f` override. */
export function resolveDockerfilePath(file, contextDir) {
  return file ?? join(contextDir, DEFAULT_DOCKERFILE);
}
