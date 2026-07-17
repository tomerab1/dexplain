/**
 * Parses Dockerfile text into a flat instruction list plus a stage list, tolerant of
 * line continuations and full-line comments. Adds shellText to every instruction
 * (shell-form: args; exec-form: argv joined with spaces; heredoc: body).
 *
 * Limitations: (1) only the first heredoc per instruction is consumed; (2) parser
 * directives are recognized only before the first instruction.
 */

const COMMENT = /^\s*#/;
const CONTINUATION = /\\\s*$/;
const BACKTICK_CONTINUATION = /`\s*$/;
const FROM_STAGE = /\bAS\s+([\w.-]+)\s*$/i;
const PARSER_DIRECTIVE = /^#\s*(syntax|escape)\s*=\s*(\S+)/i;
const HEREDOC_OPENER = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
const EXEC_FORM = /^\s*\[/;

function isComment(line) {
  return COMMENT.test(line);
}

function extractDirectives(lines) {
  const directives = {};
  let directiveEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || isComment(line)) {
      const match = line.match(PARSER_DIRECTIVE);
      if (match) {
        const [, name, value] = match;
        directives[name.toLowerCase()] = value;
        directiveEnd = i + 1;
      } else if (line !== '') {
        break;
      }
    } else {
      break;
    }
  }
  return { directives, directiveEnd };
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

function parseHeredoc(args, rawLines, startIndex) {
  const match = args.match(HEREDOC_OPENER);
  if (!match) return { args, heredoc: null, consumedLines: 0 };

  const [fullMatch, , delimiter] = match;
  const beforeHeredoc = args.substring(0, match.index) + args.substring(match.index + fullMatch.length);
  const bodyLines = [];
  let delimiterIndex = rawLines.length;

  for (let i = startIndex + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === delimiter) {
      delimiterIndex = i;
      break;
    }
    bodyLines.push(line);
  }

  return { args: beforeHeredoc.trim(), heredoc: { delimiter, body: bodyLines.join('\n') }, delimiterIndex };
}

function detectExecForm(args) {
  if (!EXEC_FORM.test(args)) return { execForm: false, shellText: args };
  try {
    const argv = JSON.parse(args);
    if (!Array.isArray(argv) || !argv.every((item) => typeof item === 'string')) {
      return { execForm: false, shellText: args };
    }
    return { execForm: true, shellText: argv.join(' ') };
  } catch {
    return { execForm: false, shellText: args };
  }
}

function parseOnbuild(args) {
  const inner = args.trim();
  const spaceAt = inner.search(/\s/);
  if (spaceAt === -1) {
    return { keyword: inner.toUpperCase(), args: '' };
  }
  const keyword = inner.slice(0, spaceAt).toUpperCase();
  const innerArgs = inner.slice(spaceAt + 1).trim();
  return { keyword, args: innerArgs };
}

export function parseDockerfile(text, path = null) {
  const instructions = [];
  const stages = [];
  let stageIndex = -1;

  const allLines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const { directives, directiveEnd } = extractDirectives(allLines);
  const continuationChar = directives.escape === '`' ? '`' : '\\';
  const contRegex = continuationChar === '\\' ? CONTINUATION : BACKTICK_CONTINUATION;

  let i = directiveEnd;
  while (i < allLines.length) {
    const rawLine = allLines[i];
    if (isComment(rawLine) || rawLine.trim() === '') {
      i++;
      continue;
    }

    const lineNum = i + 1;
    const parts = [];
    let currentLine = i;

    parts.push(rawLine.replace(contRegex, '').trim());
    while (currentLine < allLines.length && contRegex.test(allLines[currentLine])) {
      currentLine++;
      if (currentLine < allLines.length) {
        parts.push(allLines[currentLine].replace(contRegex, '').trim());
      }
    }

    const raw = parts.join(' ').trim();
    const { keyword, args: baseArgs } = splitKeyword(raw);
    let args = baseArgs;
    let shellText = args;
    let execForm = false;
    let heredoc = null;
    let triggered = null;

    if (keyword === 'FROM') {
      stageIndex += 1;
      stages.push({ index: stageIndex, name: stageNameFrom(args), image: args.split(/\s+/)[0], line: lineNum });
    }

    if (keyword === 'ONBUILD') {
      const innerInstr = parseOnbuild(args);
      triggered = { keyword: innerInstr.keyword, args: innerInstr.args };
      const { execForm: innerExecForm, shellText: innerShellText } = detectExecForm(innerInstr.args);
      triggered.execForm = innerExecForm || undefined;
      triggered.shellText = innerShellText;
      shellText = args;
    } else {
      const { args: argsAfterHeredoc, heredoc: heredocInfo, delimiterIndex } = parseHeredoc(args, allLines, currentLine);
      if (heredocInfo) {
        heredoc = heredocInfo;
        args = argsAfterHeredoc;
        shellText = heredocInfo.body;
        currentLine = delimiterIndex;
      } else {
        const { execForm: isExecForm, shellText: execShellText } = detectExecForm(args);
        execForm = isExecForm;
        shellText = execShellText;
      }
    }

    const instruction = { line: lineNum, keyword, args, raw, stageIndex: Math.max(stageIndex, 0), shellText };
    if (execForm) instruction.execForm = true;
    if (heredoc) instruction.heredoc = heredoc;
    if (triggered) instruction.triggered = triggered;

    instructions.push(instruction);
    i = currentLine + 1;
  }

  return { path, instructions, stages, directives };
}
