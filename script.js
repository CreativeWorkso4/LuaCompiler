/**
 * ============================================================
 * Night Lua Toolkit — script.js
 * Browser-only Lua analysis and transformation tools
 * ============================================================
 */

'use strict';

// ============================================================
// DOM REFERENCES
// ============================================================
const inputEl    = document.getElementById('input');
const outputEl   = document.getElementById('output');
const errPanel   = document.getElementById('error-panel');
const errBody    = document.getElementById('error-body');
const errCount   = document.getElementById('error-count');
const outputHint = document.getElementById('output-hint');

const statLines  = document.getElementById('stat-lines');
const statChars  = document.getElementById('stat-chars');
const statTokens = document.getElementById('stat-tokens');

// Obfuscation option checkboxes / selects
const optRename  = document.getElementById('opt-rename');
const optStrings = document.getElementById('opt-strings');
const optJunk    = document.getElementById('opt-junk');
const optBytes   = document.getElementById('opt-bytes');
const optLevel   = document.getElementById('opt-junk-level');

// ============================================================
// LIVE STATS — update on every keystroke
// ============================================================
inputEl.addEventListener('input', updateStats);

function updateStats() {
  const v      = inputEl.value;
  const lines  = v ? v.split('\n').length : 0;
  const chars  = v.length;
  const tokens = Math.ceil(chars / 3.6); // rough GPT-style estimate
  statLines.textContent  = lines;
  statChars.textContent  = chars;
  statTokens.textContent = '~' + tokens;
}

// ============================================================
// STATUS HELPERS
// ============================================================

/** Escape HTML special characters */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Show messages in the status panel.
 * @param {Array<{type:'error'|'warning'|'ok'|'info', text:string}>} msgs
 */
function showStatus(msgs) {
  // Determine overall state
  const hasErr  = msgs.some(m => m.type === 'error');
  const hasWarn = msgs.some(m => m.type === 'warning');
  const isOk    = !hasErr && !hasWarn && msgs.some(m => m.type === 'ok');

  errPanel.className = 'error-panel' +
    (hasErr  ? ' state-error'   :
     hasWarn ? ' state-warning' :
     isOk    ? ' state-ok'      : '');

  const errorMsgs = msgs.filter(m => m.type === 'error');
  errCount.textContent = errorMsgs.length > 0
    ? `${errorMsgs.length} error${errorMsgs.length > 1 ? 's' : ''}`
    : '';

  const icons = { error: '✖', warning: '⚠', ok: '✔', info: 'ℹ' };

  errBody.innerHTML = msgs.map(m =>
    `<div class="msg ${m.type}">
       <span class="msg-icon">${icons[m.type] || 'ℹ'}</span>
       <span>${esc(m.text)}</span>
     </div>`
  ).join('');
}

/** Write to output textarea and update the hint */
function setOutput(code, hintText) {
  outputEl.value = code;
  if (hintText) outputHint.textContent = hintText;
}

// ============================================================
// LUA SCANNER
// Strips strings and comments from source so structural checks
// run on "clean" code.  Returns:
//   clean  — source with strings replaced by "" and comments removed
//   errors — array of {line, text} for unclosed literals
// ============================================================
function scanLua(code) {
  let clean  = '';
  const errors = [];
  let i      = 0;
  let lineNo = 1;
  const n    = code.length;

  while (i < n) {
    const c  = code[i];
    const c1 = code[i + 1];
    const c2 = code[i + 2];
    const c3 = code[i + 3];

    // ---- Multiline comment  --[[ ... ]] ----
    if (c === '-' && c1 === '-' && c2 === '[' && c3 === '[') {
      const sl = lineNo;
      i += 4;
      let closed = false;
      while (i < n) {
        if (code[i] === ']' && code[i + 1] === ']') { i += 2; closed = true; break; }
        if (code[i] === '\n') { lineNo++; clean += '\n'; }
        i++;
      }
      if (!closed) errors.push({ line: sl, text: `Line ${sl}: Unclosed multiline comment  --[[` });
      continue;
    }

    // ---- Single-line comment  -- ----
    if (c === '-' && c1 === '-') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }

    // ---- Multiline string  [[ ... ]] ----
    if (c === '[' && c1 === '[') {
      const sl = lineNo;
      i += 2;
      let closed = false;
      clean += '""'; // placeholder
      while (i < n) {
        if (code[i] === ']' && code[i + 1] === ']') { i += 2; closed = true; break; }
        if (code[i] === '\n') { lineNo++; clean += '\n'; }
        i++;
      }
      if (!closed) errors.push({ line: sl, text: `Line ${sl}: Unclosed multiline string  [[` });
      continue;
    }

    // ---- Quoted string  "..." or '...' ----
    if (c === '"' || c === "'") {
      const q  = c;
      const sl = lineNo;
      i++;
      clean += '""'; // placeholder
      let closed = false;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }   // skip escape sequence
        if (code[i] === '\n') break;                   // line break = unclosed
        if (code[i] === q)    { i++; closed = true; break; }
        i++;
      }
      if (!closed) errors.push({ line: sl, text: `Line ${sl}: Unclosed string literal (${q})` });
      continue;
    }

    // ---- Newlines ----
    if (c === '\n') { lineNo++; clean += '\n'; i++; continue; }

    // ---- Regular character ----
    clean += c;
    i++;
  }

  return { clean, errors };
}

// ============================================================
// CHECK SYNTAX
// ============================================================
function checkSyntax() {
  const code = inputEl.value;
  if (!code.trim()) {
    showStatus([{ type: 'info', text: 'No code to check.' }]);
    return;
  }

  const msgs = [];
  const { clean, errors } = scanLua(code);

  // --- 1. String / comment scan errors ---
  errors.forEach(e => msgs.push({ type: 'error', text: e.text }));

  // --- 2. Bracket balance check on clean code ---
  const bracketStack = [];
  const matching     = { ')': '(', '}': '{', ']': '[' };
  const isOpen       = new Set(['(', '{', '[']);
  const isClose      = new Set([')', '}', ']']);
  const cleanLines   = clean.split('\n');

  cleanLines.forEach((line, li) => {
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (isOpen.has(ch)) {
        bracketStack.push({ ch, line: li + 1 });
      } else if (isClose.has(ch)) {
        if (bracketStack.length === 0) {
          msgs.push({ type: 'error', text: `Line ${li + 1}: Unexpected '${ch}' — no matching '${matching[ch]}'` });
        } else {
          const top = bracketStack[bracketStack.length - 1];
          if (top.ch !== matching[ch]) {
            msgs.push({ type: 'error', text: `Line ${li + 1}: Mismatched bracket '${ch}' (opened '${top.ch}' on line ${top.line})` });
          }
          bracketStack.pop();
        }
      }
    }
  });

  bracketStack.forEach(b => {
    msgs.push({ type: 'error', text: `Line ${b.line}: Unclosed '${b.ch}' — never closed` });
  });

  // --- 3. Block keyword balance (function/if/do/for/while/repeat) ---
  // Stack holds { type:'block'|'repeat', kw:string, line:number }
  const blockStack = [];

  cleanLines.forEach((line, li) => {
    // Tokenise keywords in order of appearance
    const re     = /\b(function|then|do|repeat|end|until|else|elseif)\b/g;
    let   match;
    while ((match = re.exec(line)) !== null) {
      const kw = match[1];
      switch (kw) {
        case 'function':
        case 'then':
        case 'do':
          blockStack.push({ type: 'block', kw, line: li + 1 });
          break;

        case 'repeat':
          blockStack.push({ type: 'repeat', kw: 'repeat', line: li + 1 });
          break;

        case 'else':
          // Closes the previous 'then' block and opens a new one
          if (blockStack.length > 0 && blockStack[blockStack.length - 1].type === 'block') {
            blockStack.pop();
            blockStack.push({ type: 'block', kw: 'else', line: li + 1 });
          }
          break;

        case 'elseif':
          // Closes the previous 'then'; 'then' that follows will push a new one
          if (blockStack.length > 0 && blockStack[blockStack.length - 1].type === 'block') {
            blockStack.pop();
          }
          break;

        case 'end':
          if (blockStack.length === 0) {
            msgs.push({ type: 'error', text: `Line ${li + 1}: Unexpected 'end' — no open block to close` });
          } else {
            const top = blockStack[blockStack.length - 1];
            if (top.type === 'repeat') {
              msgs.push({ type: 'error', text: `Line ${li + 1}: 'end' used on a 'repeat' block — use 'until <condition>' instead` });
            }
            blockStack.pop();
          }
          break;

        case 'until':
          if (blockStack.length === 0) {
            msgs.push({ type: 'error', text: `Line ${li + 1}: Unexpected 'until' — no matching 'repeat'` });
          } else {
            const top = blockStack[blockStack.length - 1];
            if (top.type !== 'repeat') {
              msgs.push({ type: 'error', text: `Line ${li + 1}: 'until' found but open block was '${top.kw}' (use 'end' instead)` });
            }
            blockStack.pop();
          }
          break;
      }
    }
  });

  // Anything left on the block stack is unclosed
  blockStack.forEach(b => {
    const hint = b.type === 'repeat' ? " (needs 'until')" : " (needs 'end')";
    msgs.push({ type: 'error', text: `Line ${b.line}: Unclosed '${b.kw}' block${hint}` });
  });

  // --- 4. Risky pattern warnings (on original source) ---
  const riskyPatterns = [
    { re: /\bloadstring\b/, msg: "loadstring — executes arbitrary code at runtime" },
    { re: /\bHttpGet\b/,    msg: "HttpGet — outbound HTTP request" },
    { re: /\bgetgenv\b/,    msg: "getgenv — accesses the global environment table" },
    { re: /\bgetfenv\b/,    msg: "getfenv — accesses a function's environment" },
    { re: /\bsetfenv\b/,    msg: "setfenv — modifies a function's environment" },
    { re: /\brawset\b/,     msg: "rawset — bypasses __newindex metamethod" },
    { re: /\brawget\b/,     msg: "rawget — bypasses __index metamethod" },
    { re: /\bdebug\./,      msg: "debug library — low-level introspection" },
    { re: /\bos\.execute\b/,msg: "os.execute — runs shell commands" },
    { re: /\bio\.open\b/,   msg: "io.open — filesystem access" },
  ];

  code.split('\n').forEach((line, li) => {
    riskyPatterns.forEach(p => {
      if (p.re.test(line)) {
        msgs.push({ type: 'warning', text: `Line ${li + 1}: Risky pattern — ${p.msg}` });
      }
    });
  });

  // --- Result ---
  if (msgs.length === 0) {
    showStatus([{ type: 'ok', text: 'No issues found. Basic syntax check passed ✓' }]);
  } else {
    const errCount = msgs.filter(m => m.type === 'error').length;
    const wrnCount = msgs.filter(m => m.type === 'warning').length;
    showStatus(msgs);
    // Print summary as first entry
    const summary = [];
    if (errCount > 0) summary.push(`${errCount} error${errCount > 1 ? 's' : ''}`);
    if (wrnCount > 0) summary.push(`${wrnCount} warning${wrnCount > 1 ? 's' : ''}`);
    // Prepend summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'msg ' + (errCount > 0 ? 'error' : 'warning');
    summaryEl.innerHTML = `<span class="msg-icon">${errCount > 0 ? '✖' : '⚠'}</span><span><strong>Found ${summary.join(' and ')}</strong></span>`;
    errBody.insertBefore(summaryEl, errBody.firstChild);
  }
}

// ============================================================
// BEAUTIFY
// ============================================================
function beautifyLua() {
  const code = inputEl.value;
  if (!code.trim()) {
    showStatus([{ type: 'info', text: 'Nothing to beautify.' }]);
    return;
  }

  const TAB   = '    '; // 4-space indent
  const lines = code.split('\n');
  const out   = [];
  let depth   = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) { out.push(''); continue; }

    // ---- Decrease depth BEFORE printing these keywords ----
    if (/^(end|until|else|elseif)\b/.test(line)) {
      depth = Math.max(0, depth - 1);
    }

    out.push(TAB.repeat(depth) + line);

    // ---- Increase depth AFTER printing openers ----
    const opensBlock = (
      /\bthen\s*$/.test(line)    ||   // if/elseif ... then
      /\bdo\s*$/.test(line)      ||   // for/while/do ... do
      /^else$/.test(line)        ||   // standalone else
      /^repeat$/.test(line)      ||   // repeat
      (
        /\bfunction\b/.test(line) &&  // function definition
        !/\bend\b/.test(line)         // not a one-line closure
      )
    );

    if (opensBlock) depth++;
  }

  const result = out.join('\n');
  setOutput(result, 'Beautified');
  showStatus([{ type: 'ok', text: 'Code beautified successfully.' }]);
}

// ============================================================
// MINIFY
// Properly handles strings and comments using the scanner.
// ============================================================
function minifyLua() {
  const code = inputEl.value;
  if (!code.trim()) {
    showStatus([{ type: 'info', text: 'Nothing to minify.' }]);
    return;
  }

  // Walk source, emit compact output
  let result = '';
  let i      = 0;
  const n    = code.length;

  while (i < n) {
    const c  = code[i];
    const c1 = code[i + 1];
    const c2 = code[i + 2];
    const c3 = code[i + 3];

    // Drop multiline comments
    if (c === '-' && c1 === '-' && c2 === '[' && c3 === '[') {
      i += 4;
      while (i < n && !(code[i] === ']' && code[i + 1] === ']')) i++;
      i += 2;
      continue;
    }

    // Drop single-line comments
    if (c === '-' && c1 === '-') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }

    // Keep multiline strings verbatim
    if (c === '[' && c1 === '[') {
      result += '[[';
      i += 2;
      while (i < n) {
        if (code[i] === ']' && code[i + 1] === ']') { result += ']]'; i += 2; break; }
        result += code[i++];
      }
      continue;
    }

    // Keep quoted strings verbatim
    if (c === '"' || c === "'") {
      const q = c;
      result += q;
      i++;
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { result += code[i] + code[i + 1]; i += 2; continue; }
        if (code[i] === '\n') break;
        result += code[i++];
      }
      if (i < n) result += code[i++];
      continue;
    }

    // Collapse whitespace / newlines into single space
    if (c === '\n' || c === '\r' || c === '\t' || c === ' ') {
      if (result.length > 0 && result[result.length - 1] !== ' ') result += ' ';
      i++;
      continue;
    }

    result += c;
    i++;
  }

  // Trim excess spaces around punctuation
  result = result
    .replace(/ *([\(\)\[\]\{\},;:]) */g, '$1')
    .replace(/ *([\+\*\/%\^#]) */g, '$1')
    .replace(/ *\.\. */g, '..')
    .replace(/ *~= */g, '~=')
    .replace(/ *== */g, '==')
    .replace(/ *<= */g, '<=')
    .replace(/ *>= */g, '>=')
    .replace(/ *= */g, '=');

  // Ensure spaces around reserved keywords so they stay valid
  const keywords = [
    'then','do','end','local','function','return','if','else','elseif',
    'for','while','repeat','until','in','and','or','not','nil','true','false'
  ];
  keywords.forEach(kw => {
    result = result.replace(new RegExp(`\\b${kw}\\b`, 'g'), ` ${kw} `);
  });

  result = result.replace(/ {2,}/g, ' ').trim();

  const saved = Math.round((1 - result.length / code.length) * 100);
  setOutput(result, 'Minified');
  showStatus([{ type: 'ok', text: `Minified: ${code.length} → ${result.length} chars (${saved}% smaller)` }]);
}

// ============================================================
// OBFUSCATION HELPERS
// ============================================================

/** Generate a random identifier of given length (starts with a letter) */
function randId(len) {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alnum = alpha + '0123456789';
  let name = alpha[Math.floor(Math.random() * alpha.length)];
  for (let i = 1; i < len; i++) {
    name += alnum[Math.floor(Math.random() * alnum.length)];
  }
  return name;
}

/** Get a unique random identifier not in the used set */
function uniqueId(usedSet) {
  const len = 3 + Math.floor(Math.random() * 4); // 3–6 chars
  let name;
  do { name = randId(len); } while (usedSet.has(name));
  usedSet.add(name);
  return name;
}

/** Encode a plain string as a Lua string.char(...) call */
function encodeStringToChar(str) {
  const bytes = Array.from(str).map(c => c.charCodeAt(0));
  return `string.char(${bytes.join(',')})`;
}

/** Generate Lua junk code lines that do nothing useful */
function makeJunkLines(level) {
  const counts = { low: 4, medium: 9, high: 18 };
  const n      = counts[level] || 4;
  const used   = new Set(['_G', '_VERSION', 'print', 'pairs', 'ipairs', 'type', 'tostring', 'tonumber']);
  const lines  = [];

  for (let i = 0; i < n; i++) {
    const v = uniqueId(used);
    const r = Math.floor(Math.random() * 5);
    if (r === 0) {
      // Fake numeric local
      lines.push(`local ${v}=${Math.floor(Math.random() * 999999)}`);
    } else if (r === 1) {
      // Fake string local via string.char
      const dummy = randId(4 + Math.floor(Math.random() * 4));
      lines.push(`local ${v}=string.char(${dummy.split('').map(c => c.charCodeAt(0)).join(',')})`);
    } else if (r === 2) {
      // Fake function that returns a constant
      lines.push(`local function ${v}() return ${Math.floor(Math.random() * 9999)} end`);
    } else if (r === 3) {
      // Dead if-false block
      const val  = uniqueId(used);
      const val2 = uniqueId(used);
      lines.push(`local ${val}=false;if ${val} then local ${val2}=1 end`);
    } else {
      // Fake table
      const val  = uniqueId(used);
      const val2 = uniqueId(used);
      lines.push(`local ${val}={};local ${val2}=${val}`);
    }
  }
  return lines;
}

/**
 * Rename local variables and function parameters.
 * NOTE: Browser-only regex approach; works for most common code.
 */
function renameLocalVars(code) {
  const nameMap = new Map();
  const used    = new Set();

  // Collect local variable names
  const localRe = /\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = localRe.exec(code)) !== null) {
    const orig = m[1];
    if (!nameMap.has(orig)) nameMap.set(orig, uniqueId(used));
  }

  // Collect function parameter names
  const funcRe = /\bfunction\s*(?:[a-zA-Z_.:\[\]"']+\s*)?\(([^)]*)\)/g;
  while ((m = funcRe.exec(code)) !== null) {
    m[1].split(',').map(p => p.trim()).filter(Boolean).forEach(param => {
      const name = param.replace(/\s*=.*/, '').trim();
      if (name && /^[a-zA-Z_]/.test(name) && !nameMap.has(name)) {
        nameMap.set(name, uniqueId(used));
      }
    });
  }

  // Replace all occurrences (whole-word only)
  let result = code;
  nameMap.forEach((newName, origName) => {
    result = result.replace(
      new RegExp(`(?<![a-zA-Z0-9_.])${origName}(?![a-zA-Z0-9_])`, 'g'),
      newName
    );
  });

  return result;
}

/**
 * Encode string literals in code to string.char(…) calls.
 * Carefully skips multiline strings [[ ]] so they're not double-encoded.
 */
function encodeStringsInCode(code) {
  let result = '';
  let i      = 0;
  const n    = code.length;

  while (i < n) {
    const c  = code[i];
    const c1 = code[i + 1];

    // Keep multiline strings as-is
    if (c === '[' && c1 === '[') {
      result += '[[';
      i += 2;
      while (i < n) {
        if (code[i] === ']' && code[i + 1] === ']') { result += ']]'; i += 2; break; }
        result += code[i++];
      }
      continue;
    }

    // Encode quoted strings
    if (c === '"' || c === "'") {
      const q = c;
      let inner = '';
      i++;
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') {
          // Handle escape sequences
          const esc = code[i + 1];
          if      (esc === 'n')  { inner += '\n'; i += 2; }
          else if (esc === 't')  { inner += '\t'; i += 2; }
          else if (esc === '\\') { inner += '\\'; i += 2; }
          else if (esc === '"')  { inner += '"';  i += 2; }
          else if (esc === "'")  { inner += "'";  i += 2; }
          else                   { inner += code[i] + code[i + 1]; i += 2; }
          continue;
        }
        if (code[i] === '\n') break;
        inner += code[i++];
      }
      if (i < n && code[i] === q) i++; // skip closing quote
      result += encodeStringToChar(inner);
      continue;
    }

    result += c;
    i++;
  }

  return result;
}

/**
 * Encode the full Lua source as a byte array and wrap in load()…()
 * Splits into chunks to avoid extremely long lines.
 */
function byteEncodeWhole(code) {
  const bytes     = Array.from(code).map(c => c.charCodeAt(0));
  const chunkSize = 55;
  const chunkVars = [];
  const used      = new Set();
  let   output    = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk   = bytes.slice(i, i + chunkSize);
    const varName = uniqueId(used);
    chunkVars.push(varName);
    output += `local ${varName}=string.char(${chunk.join(',')})\n`;
  }

  const concatVar = uniqueId(used);
  output += `local ${concatVar}=${chunkVars.join('..')}\n`;
  output += `load(${concatVar})()`;

  return output;
}

// ============================================================
// OBFUSCATE
// ============================================================
function obfuscateLua() {
  const code = inputEl.value;
  if (!code.trim()) {
    showStatus([{ type: 'info', text: 'Nothing to obfuscate.' }]);
    return;
  }

  const doRename  = optRename.checked;
  const doStrEnc  = optStrings.checked;
  const doJunk    = optJunk.checked;
  const doBytes   = optBytes.checked;
  const junkLevel = optLevel.value;

  // Step 1 — Minify (strip comments + collapse whitespace)
  // Inline minify without touching strings
  let result = code;
  result = result.replace(/--\[\[[\s\S]*?\]\]/g, ' ');  // multiline comments
  result = result.replace(/--[^\[\n][^\n]*/g, '');       // single-line comments
  result = result.split('\n').map(l => l.trim()).filter(Boolean).join('\n');

  // Step 2 — Rename local variables
  if (doRename) result = renameLocalVars(result);

  // Step 3 — Encode string literals
  if (doStrEnc) result = encodeStringsInCode(result);

  // Step 4 — Inject junk code lines scattered through the source
  if (doJunk) {
    const sourceLines = result.split('\n');
    const junkLines   = makeJunkLines(junkLevel);
    const spacing     = Math.max(1, Math.floor(sourceLines.length / (junkLines.length + 1)));
    junkLines.forEach((jl, idx) => {
      const pos = Math.min((idx + 1) * spacing, sourceLines.length);
      sourceLines.splice(pos, 0, jl);
    });
    result = sourceLines.join('\n');
  }

  // Step 5 — Byte-encode entire result with load()
  if (doBytes) result = byteEncodeWhole(result);

  const activeSteps = [];
  if (doRename) activeSteps.push('variable rename');
  if (doStrEnc) activeSteps.push('string encoding');
  if (doJunk)   activeSteps.push(`junk injection (${junkLevel})`);
  if (doBytes)  activeSteps.push('byte encoding');

  setOutput(result, 'Obfuscated Output');
  showStatus([{
    type: 'ok',
    text: `Obfuscated via: ${activeSteps.length ? activeSteps.join(', ') : 'minify only'}.  Run with load() or loadstring() in Lua 5.x.`
  }]);
}

// ============================================================
// MAKE LOADSTRING
// Encode entire source as a byte-array loadstring wrapper
// ============================================================
function makeLoadstring() {
  const code = inputEl.value;
  if (!code.trim()) {
    showStatus([{ type: 'info', text: 'Nothing to encode.' }]);
    return;
  }

  const bytes     = Array.from(code).map(c => c.charCodeAt(0));
  const chunkSize = 60;
  const used      = new Set();
  const chunkVars = [];
  let   out       = '-- Generated by Night Lua Toolkit\n';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const vname = uniqueId(used);
    chunkVars.push(vname);
    out += `local ${vname}=string.char(${chunk.join(',')})\n`;
  }

  const finalVar = uniqueId(used);
  out += `local ${finalVar}=${chunkVars.join('..')}\n`;
  out += `loadstring(${finalVar})()`;

  setOutput(out, 'Loadstring Output');
  showStatus([{
    type: 'ok',
    text: `Loadstring generated (${bytes.length} bytes → ${chunkVars.length} chunks). Compatible with Lua 5.1+ / LuaJIT.`
  }]);
}

// ============================================================
// COPY OUTPUT
// ============================================================
function copyOutput() {
  const val = outputEl.value;
  if (!val.trim()) {
    showStatus([{ type: 'info', text: 'Nothing in output to copy.' }]);
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val)
      .then(() => showStatus([{ type: 'ok', text: 'Output copied to clipboard!' }]))
      .catch(() => fallbackCopy(val));
  } else {
    fallbackCopy(val);
  }
}

function fallbackCopy(text) {
  outputEl.select();
  outputEl.setSelectionRange(0, 99999);
  try {
    document.execCommand('copy');
    showStatus([{ type: 'ok', text: 'Output copied to clipboard!' }]);
  } catch {
    showStatus([{ type: 'warning', text: 'Could not auto-copy — please select the output and copy manually.' }]);
  }
}

// ============================================================
// CLEAR ALL
// ============================================================
function clearAll() {
  inputEl.value  = '';
  outputEl.value = '';
  outputHint.textContent = 'Result appears here';
  errPanel.className = 'error-panel';
  errCount.textContent   = '';
  errBody.innerHTML = `
    <div class="msg info">
      <span class="msg-icon">ℹ</span>
      <span>Use <em>Check Errors</em> to analyse your code, or run any tool above.</span>
    </div>`;
  updateStats();
}

// ============================================================
// INIT
// ============================================================
updateStats();

