const codeInput = document.getElementById("codeInput");
const highlighting = document.getElementById("highlighting");
const diagnosticsBox = document.getElementById("diagnostics");
const statusBox = document.getElementById("status");
const checkBtn = document.getElementById("checkBtn");

const defaultCode = `local Players = game:GetService("Players")
local player = Players.LocalPlayer

if player.Name == "Unknown272173" then
  print("Player found")
end
`;

codeInput.value = defaultCode;

const luaKeywords = [
  "and", "break", "do", "else", "elseif", "end", "false",
  "for", "function", "if", "in", "local", "nil", "not",
  "or", "repeat", "return", "then", "true", "until", "while"
];

const robloxWords = [
  "game", "workspace", "script", "Instance", "Vector3", "CFrame",
  "Color3", "UDim2", "Enum", "Players", "ReplicatedStorage",
  "ServerScriptService", "StarterGui", "StarterPlayer",
  "RunService", "UserInputService", "TweenService",
  "GetService", "WaitForChild", "FindFirstChild", "FireServer",
  "InvokeServer", "Connect", "Destroy", "Clone", "Parent"
];

function escapeHTML(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightLua(code) {
  let safe = escapeHTML(code);

  safe = safe.replace(/(--.*)/g, `<span class="comment">$1</span>`);

  safe = safe.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, `<span class="string">$1</span>`);

  safe = safe.replace(/\b(\d+(\.\d+)?)\b/g, `<span class="number">$1</span>`);

  const keywordRegex = new RegExp(`\\b(${luaKeywords.join("|")})\\b`, "g");
  safe = safe.replace(keywordRegex, `<span class="keyword">$1</span>`);

  const robloxRegex = new RegExp(`\\b(${robloxWords.join("|")})\\b`, "g");
  safe = safe.replace(robloxRegex, `<span class="roblox">$1</span>`);

  safe = safe.replace(/(==|~=|<=|>=|\+|-|\*|\/|%|=)/g, `<span class="operator">$1</span>`);

  return safe;
}

function getLineNumber(code, index) {
  return code.slice(0, index).split("\n").length;
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

    if (!trimmed || trimmed.startsWith("--")) return;

    for (const char of line) {
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

    if (/\bgame:getservice\s*\(/i.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Incorrect Roblox method capitalization",
        "Roblox Lua is case-sensitive. getservice should be GetService.",
        `Use game:GetService("Players")`
      );
    }

    if (/\bgame\.GetService\s*\(/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Wrong GetService call",
        "GetService should be called with a colon, not a dot.",
        `Use game:GetService("Players")`
      );
    }

    if (/\bgame:GetService\s*\(\s*players\s*\)/i.test(line)) {
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

    if (/^\s*if\s+.*[^~=<>]=[^=].*\s+then\b/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside if statement",
        "You used = inside an if statement. For comparison, use ==.",
        `Example: if x == 5 then`
      );
    }

    if (/^\s*elseif\s+.*[^~=<>]=[^=].*\s+then\b/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside elseif statement",
        "You used = inside an elseif statement. For comparison, use ==.",
        `Example: elseif x == 5 then`
      );
    }

    if (/^\s*while\s+.*[^~=<>]=[^=].*\s+do\b/.test(line)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Possible assignment inside while statement",
        "You used = inside a while condition. For comparison, use ==.",
        `Example: while x == 5 do`
      );
    }

    if (/^\s*if\b/.test(trimmed) && !/\bthen\b/.test(trimmed)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing then",
        "Lua if statements need then.",
        `Example: if condition then`
      );
    }

    if (/^\s*elseif\b/.test(trimmed) && !/\bthen\b/.test(trimmed)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing then",
        "Lua elseif statements need then.",
        `Example: elseif condition then`
      );
    }

    if (/^\s*while\b/.test(trimmed) && !/\bdo\b/.test(trimmed)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing do",
        "Lua while loops need do.",
        `Example: while condition do`
      );
    }

    if (/^\s*for\b/.test(trimmed) && !/\bdo\b/.test(trimmed)) {
      addIssue(
        issues,
        "error",
        lineNumber,
        "Missing do",
        "Lua for loops need do.",
        `Example: for i = 1, 10 do`
      );
    }

    if (/^\s*function\b/.test(trimmed)) {
      blockStack.push({ type: "function", line: lineNumber });
    }

    if (/^\s*if\b/.test(trimmed)) {
      blockStack.push({ type: "if", line: lineNumber });
    }

    if (/^\s*for\b/.test(trimmed)) {
      blockStack.push({ type: "for", line: lineNumber });
    }

    if (/^\s*while\b/.test(trimmed)) {
      blockStack.push({ type: "while", line: lineNumber });
    }

    if (/^\s*do\b/.test(trimmed)) {
      blockStack.push({ type: "do", line: lineNumber });
    }

    if (/^\s*repeat\b/.test(trimmed)) {
      blockStack.push({ type: "repeat", line: lineNumber });
    }

    if (/^\s*end\b/.test(trimmed)) {
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

    if (/^\s*until\b/.test(trimmed)) {
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

    if (/\bprint\s+[("']/.test(line)) {
      addIssue(
        issues,
        "warning",
        lineNumber,
        "Possible missing parentheses",
        "Lua usually calls print with parentheses.",
        `Use print("hello")`
      );
    }

    if (/\blocal\s+\w+\s*$/.test(line)) {
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
    addIssue(issues, "error", lines.length, "Missing closing parenthesis", "You opened more parentheses than you closed.", "Add a )");
  }

  if (parenCount < 0) {
    addIssue(issues, "error", lines.length, "Extra closing parenthesis", "You closed more parentheses than you opened.", "Remove an extra )");
  }

  if (bracketCount > 0) {
    addIssue(issues, "error", lines.length, "Missing closing bracket", "You opened more brackets than you closed.", "Add a ]");
  }

  if (bracketCount < 0) {
    addIssue(issues, "error", lines.length, "Extra closing bracket", "You closed more brackets than you opened.", "Remove an extra ]");
  }

  if (braceCount > 0) {
    addIssue(issues, "error", lines.length, "Missing closing brace", "You opened more table braces than you closed.", "Add a }");
  }

  if (braceCount < 0) {
    addIssue(issues, "error", lines.length, "Extra closing brace", "You closed more table braces than you opened.", "Remove an extra }");
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
      <strong>${issue.type.toUpperCase()} on line ${issue.line}: ${issue.title}</strong>
      <div>${issue.message}</div>
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

checkBtn.addEventListener("click", updateEditor);

updateEditor();
