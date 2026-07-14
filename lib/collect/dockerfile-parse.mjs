/**
 * Parses Dockerfile text into a flat instruction list plus a stage list, tolerant of
 * line continuations and full-line comments. It does not validate syntax — its job is
 * to give rules enough structure (keyword, args, stage, line number) to reason over.
 */

const COMMENT = /^\s*#/;
const CONTINUATION = /\\\s*$/;
const FROM_STAGE = /\bAS\s+([\w.-]+)\s*$/i;

function isComment(line) {
  return COMMENT.test(line);
}

function joinLogicalLines(text) {
  const rawLines = text.split('\n');
  const logical = [];
  let buffer = null;
  rawLines.forEach((rawLine, position) => {
    if (buffer === null && (isComment(rawLine) || rawLine.trim() === '')) return;
    if (buffer === null) buffer = { line: position + 1, parts: [] };
    buffer.parts.push(rawLine.replace(CONTINUATION, '').trim());
    if (!CONTINUATION.test(rawLine)) {
      logical.push({ line: buffer.line, raw: buffer.parts.join(' ').trim() });
      buffer = null;
    }
  });
  if (buffer) logical.push({ line: buffer.line, raw: buffer.parts.join(' ').trim() });
  return logical.filter((entry) => entry.raw !== '');
}

function splitKeyword(raw) {
  const spaceAt = raw.search(/\s/);
  if (spaceAt === -1) return { keyword: raw.toUpperCase(), args: '' };
  return { keyword: raw.slice(0, spaceAt).toUpperCase(), args: raw.slice(spaceAt + 1).trim() };
}

function stageNameFrom(args) {
  const match = args.match(FROM_STAGE);
  return match ? match[1] : null;
}

export function parseDockerfile(text, path = null) {
  const instructions = [];
  const stages = [];
  let stageIndex = -1;
  for (const { line, raw } of joinLogicalLines(text)) {
    const { keyword, args } = splitKeyword(raw);
    if (keyword === 'FROM') {
      stageIndex += 1;
      stages.push({ index: stageIndex, name: stageNameFrom(args), image: args.split(/\s+/)[0], line });
    }
    instructions.push({ line, keyword, args, raw, stageIndex: Math.max(stageIndex, 0) });
  }
  return { path, instructions, stages };
}
