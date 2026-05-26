const APP_VERSION = "1.1";

const codeInput = document.getElementById("codeInput");
const highlighting = document.getElementById("highlighting");
const diagnosticsBox = document.getElementById("diagnostics");
const statusBox = document.getElementById("status");
const versionTag = document.getElementById("versionTag");

if (versionTag) {
  versionTag.textContent = `v${APP_VERSION}`;
}

console.log(`Lua Compiler v${APP_VERSION} loaded`);

const defaultCode = `local Players = game:GetService("Players")
local player = Players.LocalPlayer

if player then
  print("Player found")
end
`;

codeInput.value = defaultCode;

const luaKeywords = new Set([
  "and", "break", "do", "else", "elseif", "end", "false",
  "for", "function", "if", "in", "local", "nil", "not",
  "or", "repeat", "return", "then", "true", "until", "while"
]);

const robloxWords = new Set([
  "game", "workspace", "script", "Instance", "Vector3", "CFrame",
  "Color3", "UDim2", "Enum", "Players", "ReplicatedStorage",
  "ServerScriptService", "StarterGui", "StarterPlayer",
  "RunService", "UserInputService", "TweenService", "Debris",
  "Lighting", "Teams", "SoundService", "HttpService",
  "GetService", "WaitForChild", "FindFirstChild", "FindFirstChildOfClass",
  "FireServer", "InvokeServer", "FireClient", "InvokeClient",
  "Connect", "Destroy", "Clone", "Parent", "LocalPlayer",
  "Character", "Humanoid", "HumanoidRootPart", "Mouse", "Camera"
]);

function escapeHTML(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripStringsAndComments(line) {
  let result = "";
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === "-" && line[i + 1] === "-") {
      break;
    }

    if (char === `"` || char === `'`) {
      const quote = char;
      result += " ";
      i++;

      while (i < line.length) {
        result += " ";

        if (line[i] === "\\" && i + 1 < line.length) {
          result += " ";
          i += 2;
          continue;
        }

        if (line[i] === quote) {
          i++;
          break;
        }

        i++;
      }

      continue;
    }

    result += char;
    i++;
  }

  return result;
}

function tokenizeLua(code) {
  const tokens = [];
  let i = 0;

  while (i < code.length) {
    const char = code[i];

    if (char === "-" && code[i + 1] === "-") {
      const start = i;
      i += 2;

      while (i < code.length && code[i] !== "\n") {
        i++;
      }

      tokens.push({
        type: "comment",
        value: code.slice(start, i)
      });

      continue;
    }

    if (char === `"` || char === `'`) {
      const quote = char;
      const start = i;
      i++;

      while (i < code.length) {
        if (code[i] === "\\" && i + 1 < code.length) {
          i += 2;
          continue;
        }

        if (code[i] === quote) {
          i++;
          break;
        }

        i++;
      }

      tokens.push({
        type: "string",
        value: code.slice(start, i)
      });

      continue;
    }

    if (/\d/.test(char)) {
      const start = i;

      while (i < code.length && /[\d.]/.test(code[i])) {
        i++;
      }

      tokens.push({
        type: "number",
        value: code.slice(start, i)
      });

      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;

      while (i < code.length && /[A-Za-z0-9_]/.test(code[i])) {
        i++;
      }

      const word = code.slice(start, i);

      if (luaKeywords.has(word)) {
        tokens.push({ type: "keyword", value: word });
      } else if (robloxWords.has(word)) {
        tokens.push({ type: "roblox", value: word });
      } else {
        tokens.push({ type: "plain", value: word });
      }

      continue;
    }

    if ("=+-*/%<>~.".includes(char)) {
      const twoCharOperator = code.slice(i, i + 2);

      if (["==", "~=", "<=", ">=", ".."].includes(twoCharOperator)) {
        tokens.push({
          type: "operator",
          value: twoCharOperator
        });

        i += 2;
        continue;
      }

      tokens.push({
        type: "operator",
        value: char
      });

      i++;
      continue;
    }

    tokens.push({
      type: "plain",
      value: char
    });

    i++;
  }

  return tokens;
}

function highlightLua(code) {
  return tokenizeLua(code)
    .map(token => {
      const value = escapeHTML(token.value);

      if (token.type === "plain") {
        return value;
      }

      return `<span class="${token.type}">${value}</span>`;
    })
    .join("");
}

function addIssue(issues, type, line, title, message, fix = "") {
  issues.push({
    type,
    line,
    title,
    message,
    fix
  });
}

function hasWord(line, word) {
  return new RegExp(`\\b${word}\\b`).test(line);
}

function checkLua(code) {
  const issues = [];
  const lines = code.split("\n");

  let blockStack = [];
  let parenCount = 0;
  let bracketCount = 0;
  let braceCount = 0;

  lines.forEach((line, i) => {
    const lineNumber = i + 1;
    const trimmed = line.trim();
    const cleanLine = stripStringsAndComments(line);
    const cleanTrimmed = cleanLine.trim();

    if (!trimmed || trimmed.startsWith("--")) return;

    for (const char of cleanLine) {
      if (char === "(") parenCount++;
      if (char === ")") parenCount--;
      if (char === "[") bracketCount++;
      if (char === "]") bracketCount--;
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }

    if (/[“”]/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Smart quote detected",
        "Lua uses normal quotes, not curly quotes.",
        `Replace “ or ” with "`
      );
    }

    if (/[‘’]/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Smart apostrophe detected",
        "Lua uses normal apostrophes, not curly apostrophes.",
        `Replace ‘ or ’ with '`
      );
    }

    if (/\bgame:getservice\s*\(/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Incorrect GetService capitalization",
        "Roblox Lua is case-sensitive. getservice should be GetService.",
        `Use game:GetService("Players")`
      );
    }

    if (/\bgame\.GetService\s*\(/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Wrong GetService call",
        "GetService should be called with a colon, not a dot.",
        `Use game:GetService("Players")`
      );
    }

    if (/\bgame:GetService\s*\(\s*Players\s*\)/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Service name needs quotes",
        "Players must be a string inside GetService.",
        `Use game:GetService("Players")`
      );
    }

    if (/\bgame:GetService\s*\(\s*["']players["']\s*\)/.test(line)) {
      addIssue(
        issues,
        "warning",
        lineNumber,
        "Service name capitalization",
        "Roblox service names are usually PascalCase.",
        `Use game:GetService("Players")`
      );
    }

    if (/\b:waitforchild\s*\(/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Incorrect WaitForChild capitalization",
        "Roblox Lua is case-sensitive. waitforchild should be WaitForChild.",
        `Use object:WaitForChild("Name")`
      );
    }

    if (/\b:findfirstchild\s*\(/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Incorrect FindFirstChild capitalization",
        "Roblox Lua is case-sensitive. findfirstchild should be FindFirstChild.",
        `Use object:FindFirstChild("Name")`
      );
    }

    if (/^\s*if\s+.*(?<![<>=~])=(?![=]).*\s+then\b/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside if statement",
        "You used = inside an if statement. For comparison, use ==.",
        `Example: if value == 5 then`
      );
    }

    if (/^\s*elseif\s+.*(?<![<>=~])=(?![=]).*\s+then\b/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside elseif statement",
        "You used = inside an elseif statement. For comparison, use ==.",
        `Example: elseif value == 5 then`
      );
    }

    if (/^\s*while\s+.*(?<![<>=~])=(?![=]).*\s+do\b/.test(cleanLine)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside while statement",
        "You used = inside a while condition. For comparison, use ==.",
        `Example: while value == 5 do`
      );
    }

    if (/^\s*if\b/.test(cleanTrimmed) && !hasWord(cleanTrimmed, "then")) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing then",
        "Lua if statements need then.",
        `Example: if condition then`
      );
    }

    if (/^\s*elseif\b/.test(cleanTrimmed) && !hasWord(cleanTrimmed, "then")) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing then",
        "Lua elseif statements need then.",
        `Example: elseif condition then`
      );
    }

    if (/^\s*while\b/.test(cleanTrimmed) && !hasWord(cleanTrimmed, "do")) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing do",
        "Lua while loops need do.",
        `Example: while condition do`
      );
    }

    if (/^\s*for\b/.test(cleanTrimmed) && !hasWord(cleanTrimmed, "do")) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing do",
        "Lua for loops need do.",
        `Example: for i = 1, 10 do`
      );
    }

    if (/^\s*function\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "function", line: lineNumber });
    }

    if (/^\s*if\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "if", line: lineNumber });
    }

    if (/^\s*for\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "for", line: lineNumber });
    }

    if (/^\s*while\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "while", line: lineNumber });
    }

    if (/^\s*do\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "do", line: lineNumber });
    }

    if (/^\s*repeat\b/.test(cleanTrimmed)) {
      blockStack.push({ type: "repeat", line: lineNumber });
    }

    if (/^\s*end\b/.test(cleanTrimmed)) {
      const last = blockStack.pop();

      if (!last) {
        addIssue(
          issues,
          "error",
          lineNumber,
          "Unexpected end",
          "This end does not match any open block.",
          "Remove it or add a matching if/function/for/while block."
        );
      }
    }

    if (/^\s*until\b/.test(cleanTrimmed)) {
      const last = blockStack.pop();

      if (!last || last.type !== "repeat") {
        addIssue(
          issues,
          "error",
          lineNumber,
          "Unexpected until",
          "until should close a repeat block.",
          `Example: repeat ... until condition`
        );
      }
    }

    if (/\bprint\s+[("']/.test(cleanLine)) {
      addIssue(
        issues,
        "warning",
        lineNumber,
        "Possible missing parentheses",
        "Lua usually calls print with parentheses.",
        `Use print("hello")`
      );
    }

    if (/\blocal\s+\w+\s*$/.test(cleanLine)) {
      addIssue(
        issues,
        "warning",
        lineNumber,
        "Local variable has no value",
        "This is allowed, but make sure you meant to assign nil.",
        `Example: local name = "value"`
      );
    }
  });

  if (parenCount > 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Missing closing parenthesis",
      "You opened more parentheses than you closed.",
      "Add a )"
    );
  }

  if (parenCount < 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Extra closing parenthesis",
      "You closed more parentheses than you opened.",
      "Remove an extra )"
    );
  }

  if (bracketCount > 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Missing closing bracket",
      "You opened more brackets than you closed.",
      "Add a ]"
    );
  }

  if (bracketCount < 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Extra closing bracket",
      "You closed more brackets than you opened.",
      "Remove an extra ]"
    );
  }

  if (braceCount > 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Missing closing brace",
      "You opened more table braces than you closed.",
      "Add a }"
    );
  }

  if (braceCount < 0) {
    addIssue(
      issues,
      "error",
      lines.length,
      "Extra closing brace",
      "You closed more table braces than you opened.",
      "Remove an extra }"
    );
  }

  blockStack.forEach(block => {
    addIssue(
      issues,
      "error",
      block.line,
      `Missing end for ${block.type}`,
      `This ${block.type} block was opened but never closed.`,
      "Add end"
    );
  });

  return issues;
}

function renderDiagnostics(issues) {
  diagnosticsBox.innerHTML = "";

  if (issues.length === 0) {
    statusBox.className = "status good";
    statusBox.textContent = "No errors detected.";
    return;
  }

  const hasError = issues.some(issue => issue.type === "error");

  statusBox.className = hasError ? "status bad" : "status warn";
  statusBox.textContent = hasError
    ? `${issues.length} issue(s) detected.`
    : `${issues.length} warning(s) detected.`;

  issues.forEach(issue => {
    const item = document.createElement("div");
    item.className = `issue ${issue.type}`;

    item.innerHTML = `
      <strong>${issue.type.toUpperCase()} on line ${issue.line}: ${escapeHTML(issue.title)}</strong>
      <div>${escapeHTML(issue.message)}</div>
      ${issue.fix ? `<div>Fix: <code>${escapeHTML(issue.fix)}</code></div>` : ""}
    `;

    diagnosticsBox.appendChild(item);
  });
}

function updateEditor() {
  const code = codeInput.value;
  highlighting.innerHTML = highlightLua(code) + "\n";
  renderDiagnostics(checkLua(code));
}

codeInput.addEventListener("input", updateEditor);

codeInput.addEventListener("scroll", () => {
  highlighting.scrollTop = codeInput.scrollTop;
  highlighting.scrollLeft = codeInput.scrollLeft;
});

codeInput.addEventListener("keydown", event => {
  if (event.key === "Tab") {
    event.preventDefault();

    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;

    codeInput.value =
      codeInput.value.substring(0, start) +
      "  " +
      codeInput.value.substring(end);

    codeInput.selectionStart = codeInput.selectionEnd = start + 2;
    updateEditor();
  }
});

updateEditor();
