const input = document.getElementById("input");
const output = document.getElementById("output");
const messages = document.getElementById("messages");

function msg(text, good = true) {
	messages.textContent = text;
	messages.style.color = good ? "#9cffbf" : "#ff8c9b";
}

function getSetting(id) {
	return document.getElementById(id).checked;
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName(length = randomInt(5, 11)) {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let result = chars[randomInt(0, chars.length - 1)];

	for (let i = 1; i < length; i++) {
		result += chars[randomInt(0, chars.length - 1)];
	}

	return result;
}

function randomTinyName() {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let result = chars[randomInt(0, chars.length - 1)];

	if (Math.random() > 0.45) {
		result += chars[randomInt(0, chars.length - 1)];
	}

	return result;
}

function shuffleArray(array) {
	const copy = array.slice();

	for (let i = copy.length - 1; i > 0; i--) {
		const j = randomInt(0, i);
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
}

function removeComments(code) {
	let result = "";
	let i = 0;
	let inString = false;
	let quote = "";

	while (i < code.length) {
		const char = code[i];
		const next = code[i + 1];

		if (inString) {
			result += char;

			if (char === "\\" && i + 1 < code.length) {
				result += code[i + 1];
				i += 2;
				continue;
			}

			if (char === quote) {
				inString = false;
				quote = "";
			}

			i++;
			continue;
		}

		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			result += char;
			i++;
			continue;
		}

		if (char === "-" && next === "-") {
			while (i < code.length && code[i] !== "\n") {
				i++;
			}
			continue;
		}

		result += char;
		i++;
	}

	return result;
}

function minify(code) {
	return removeComments(code)
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.replace(/\s*([=+\-*/%<>~#.,;:{}()[\]])\s*/g, "$1")
		.trim();
}

function minifyOnly() {
	if (!input.value.trim()) {
		msg("No Lua code to minify.", false);
		return;
	}

	output.value = minify(input.value);
	msg("Minified successfully.");
}

function renameLocalVariables(code) {
	const reserved = new Set([
		"and", "break", "do", "else", "elseif", "end", "false", "for", "function",
		"if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
		"until", "while", "print", "string", "math", "table", "game", "workspace",
		"script", "pairs", "ipairs", "next", "load", "loadstring", "require", "pcall",
		"xpcall", "error", "type", "typeof", "task", "wait", "Vector3", "CFrame"
	]);

	const map = {};

	const patterns = [
		/\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g,
		/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g,
		/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s*,/g
	];

	for (const pattern of patterns) {
		let match;

		while ((match = pattern.exec(code)) !== null) {
			const oldName = match[1];

			if (!reserved.has(oldName) && !map[oldName]) {
				let newName = randomTinyName();

				while (reserved.has(newName) || Object.values(map).includes(newName)) {
					newName = randomTinyName();
				}

				map[oldName] = newName;
			}
		}
	}

	for (const [oldName, newName] of Object.entries(map)) {
		const re = new RegExp(`\\b${oldName}\\b`, "g");
		code = code.replace(re, newName);
	}

	return code;
}

function encodeStrings(code) {
	return code.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, function(match) {
		const raw = match.slice(1, -1);

		if (!raw.length) {
			return match;
		}

		const bytes = [];

		for (let i = 0; i < raw.length; i++) {
			const shift = randomInt(3, 30);
			bytes.push({
				value: raw.charCodeAt(i) + shift,
				shift
			});
		}

		const piece = bytes
			.map(item => `string.char(${item.value}-${item.shift})`)
			.join("..");

		return `(${piece})`;
	});
}

function stringToBytes(str) {
	const bytes = [];

	for (let i = 0; i < str.length; i++) {
		bytes.push(str.charCodeAt(i));
	}

	return bytes;
}

function encodeLiteralToLuaExpression(text) {
	const key = randomInt(15, 80);
	const data = stringToBytes(text).map(byte => byte + key);
	const dataVar = randomName();
	const outVar = randomName();
	const iVar = randomName();
	const vVar = randomName();

	return `(function()
local ${dataVar}={${data.join(",")}}
local ${outVar}={}
for ${iVar},${vVar} in ipairs(${dataVar}) do
	${outVar}[${iVar}]=_G[string.char(115,116,114,105,110,103)][string.char(99,104,97,114)](${vVar}-${key})
end
return _G[string.char(116,97,98,108,101)][string.char(99,111,110,99,97,116)](${outVar})
end)()`;
}

function makeFakeErrorCode(level) {
	let amount = 2;

	if (level === "medium") amount = 5;
	if (level === "high") amount = 9;

	const lines = [];

	const fakeErrors = [
		"attempt to index nil with 'Parent'",
		"invalid argument #1 to 'char'",
		"stack overflow",
		"bad argument #2 to 'random'",
		"missing permission",
		"bytecode mismatch",
		"tamper detected",
		"checksum failed",
		"environment blocked"
	];

	for (let i = 0; i < amount; i++) {
		const flag = randomName();
		const fake = fakeErrors[randomInt(0, fakeErrors.length - 1)];
		const fakeExpr = encodeLiteralToLuaExpression(fake);

		const style = randomInt(1, 4);

		if (style === 1) {
			lines.push(`local ${flag}=false;if ${flag} then error(${fakeExpr}) end`);
		} else if (style === 2) {
			lines.push(`pcall(function() if false then error(${fakeExpr}) end end)`);
		} else if (style === 3) {
			lines.push(`local ${flag}=0;if ${flag}>999999 then error(${fakeExpr}) end`);
		} else {
			lines.push(`do local ${flag}=nil;if ${flag}~=nil then error(${fakeExpr}) end end`);
		}
	}

	return lines.join(";");
}

function makeJunkCode(level) {
	let amount = 5;

	if (level === "medium") amount = 12;
	if (level === "high") amount = 24;

	const junk = [];

	for (let i = 0; i < amount; i++) {
		const a = randomName();
		const b = randomName();
		const c = randomName();
		const d = randomName();
		const n1 = randomInt(1000, 999999);
		const n2 = randomInt(1000, 999999);

		const style = randomInt(1, 7);

		if (style === 1) {
			junk.push(`local ${a}=${n1}`);
		} else if (style === 2) {
			junk.push(`local ${a}=false;if ${a} then local ${b}=${n2} end`);
		} else if (style === 3) {
			junk.push(`local function ${a}(${b}) return (${b} or ${n1})+${n2} end`);
		} else if (style === 4) {
			junk.push(`local ${a}={};local ${b}=${a};${b}[${randomInt(1, 9)}]=${n1}`);
		} else if (style === 5) {
			junk.push(`do local ${a}=string.char(${randomInt(65, 90)},${randomInt(65, 90)},${randomInt(65, 90)});local ${b}=#${a} end`);
		} else if (style === 6) {
			junk.push(`local ${a}=function() return ${n1} end;local ${b}=${a}()`);
		} else {
			junk.push(`local ${a},${b},${c}=${n1},${n2},false;if ${c} then ${d}=${a}+${b} end`);
		}
	}

	junk.push(makeFakeErrorCode(level));

	return shuffleArray(junk).join(";");
}

function encodeBytesAdvanced(str, keys) {
	const encoded = [];

	for (let i = 0; i < str.length; i++) {
		const charCode = str.charCodeAt(i);
		const key = keys[i % keys.length];
		const mode = i % 4;

		if (mode === 0) {
			encoded.push(charCode + key);
		} else if (mode === 1) {
			encoded.push(charCode + key + 3);
		} else if (mode === 2) {
			encoded.push(charCode + key + 7);
		} else {
			encoded.push(charCode + key + 11);
		}
	}

	return encoded;
}

function chunkArray(array, minSize = 18, maxSize = 34) {
	const chunks = [];
	let i = 0;

	while (i < array.length) {
		const size = randomInt(minSize, maxSize);
		chunks.push(array.slice(i, i + size));
		i += size;
	}

	return chunks;
}

function makeEscapedGlobalAccess(name) {
	const bytes = stringToBytes(name);
	return `_G[string.char(${bytes.join(",")})]`;
}

function makeHiddenFunctionGetter() {
	const envVar = randomName();
	const getVar = randomName();
	const bytesVar = randomName();
	const outVar = randomName();
	const iVar = randomName();
	const vVar = randomName();

	return {
		envVar,
		getVar,
		code:
`local ${envVar}=getfenv and getfenv() or _ENV or _G
local function ${getVar}(${bytesVar})
	local ${outVar}={}
	for ${iVar},${vVar} in ipairs(${bytesVar}) do
		${outVar}[${iVar}]=${envVar}[string.char(115,116,114,105,110,103)][string.char(99,104,97,114)](${vVar})
	end
	return ${envVar}[${envVar}[string.char(116,97,98,108,101)][string.char(99,111,110,99,97,116)](${outVar})]
end`
	};
}

function makeAdvancedLoader(source, level) {
	const keys = [];

	for (let i = 0; i < randomInt(5, 9); i++) {
		keys.push(randomInt(20, 140));
	}

	const encoded = encodeBytesAdvanced(source, keys);
	const chunks = chunkArray(encoded);
	const shuffledIndexes = chunks.map((_, index) => index);
	const fakeChunkCount = level === "high" ? randomInt(4, 8) : level === "medium" ? randomInt(2, 4) : randomInt(1, 2);

	const allChunkObjects = chunks.map((chunk, index) => ({
		real: true,
		index,
		data: chunk
	}));

	for (let i = 0; i < fakeChunkCount; i++) {
		const fakeLength = randomInt(8, 30);
		const fake = [];

		for (let j = 0; j < fakeLength; j++) {
			fake.push(randomInt(30, 300));
		}

		allChunkObjects.push({
			real: false,
			index: -1,
			data: fake
		});
	}

	const shuffledChunks = shuffleArray(allChunkObjects);

	const dataVar = randomName();
	const orderVar = randomName();
	const keyVar = randomName();
	const buildVar = randomName();
	const chunkVar = randomName();
	const iVar = randomName();
	const jVar = randomName();
	const bVar = randomName();
	const kVar = randomName();
	const modeVar = randomName();
	const charVar = randomName();
	const loaderVar = randomName();
	const hidden = makeHiddenFunctionGetter();

	const chunkLua = shuffledChunks
		.map(obj => `{${obj.data.join(",")}}`)
		.join(",");

	const orderLua = chunks
		.map((_, realIndex) => {
			const actualPosition = shuffledChunks.findIndex(obj => obj.real && obj.index === realIndex);
			return actualPosition + 1;
		})
		.join(",");

	const fakeErrors = makeFakeErrorCode(level);
	const junkBefore = makeJunkCode(level);
	const junkAfter = makeJunkCode(level);

	const stringBytes = stringToBytes("string").join(",");
	const charBytes = stringToBytes("char").join(",");
	const tableBytes = stringToBytes("table").join(",");
	const concatBytes = stringToBytes("concat").join(",");
	const loadstringBytes = stringToBytes("loadstring").join(",");
	const loadBytes = stringToBytes("load").join(",");

	return `
${junkBefore}
${fakeErrors}
${hidden.code}
local ${dataVar}={${chunkLua}}
local ${orderVar}={${orderLua}}
local ${keyVar}={${keys.join(",")}}
local ${buildVar}={}
for ${iVar}=1,#${orderVar} do
	local ${chunkVar}=${dataVar}[${orderVar}[${iVar}]]
	for ${jVar}=1,#${chunkVar} do
		local ${bVar}=${chunkVar}[${jVar}]
		local ${kVar}=${keyVar}[((#${buildVar})%#${keyVar})+1]
		local ${modeVar}=#${buildVar}%4
		if ${modeVar}==0 then
			${charVar}=${bVar}-${kVar}
		elseif ${modeVar}==1 then
			${charVar}=${bVar}-${kVar}-3
		elseif ${modeVar}==2 then
			${charVar}=${bVar}-${kVar}-7
		else
			${charVar}=${bVar}-${kVar}-11
		end
		${buildVar}[#${buildVar}+1]=${hidden.envVar}[string.char(${stringBytes})][string.char(${charBytes})](${charVar})
	end
end
${junkAfter}
local ${loaderVar}=${hidden.getVar}({${loadstringBytes}}) or ${hidden.getVar}({${loadBytes}})
${loaderVar}(${hidden.envVar}[string.char(${tableBytes})][string.char(${concatBytes})](${buildVar}))()
`.trim();
}

function makeChunkedStringChar(source, level) {
	const chunks = [];
	const chunkSize = randomInt(35, 60);

	for (let i = 0; i < source.length; i += chunkSize) {
		const chunk = source.slice(i, i + chunkSize);
		const bytes = [];

		for (let j = 0; j < chunk.length; j++) {
			const shift = randomInt(5, 50);
			bytes.push([chunk.charCodeAt(j) + shift, shift]);
		}

		chunks.push({
			name: randomName(),
			bytes
		});
	}

	const finalPieces = [];
	let lua = makeJunkCode(level) + "\n";

	for (const chunk of chunks) {
		const inner = chunk.bytes
			.map(pair => `string.char(${pair[0]}-${pair[1]})`)
			.join("..");

		lua += `local ${chunk.name}=${inner}\n`;
		finalPieces.push(chunk.name);
	}

	const tableVar = randomName();
	const loaderVar = randomName();

	lua += makeFakeErrorCode(level) + "\n";
	lua += `local ${tableVar}={${finalPieces.join(",")}}\n`;
	lua += `local ${loaderVar}=loadstring or load\n`;
	lua += `${loaderVar}(table.concat(${tableVar}))()`;

	return lua;
}

function basicSyntaxCheck(code) {
	const openers = (code.match(/\b(function|then|do)\b/g) || []).length;
	const ends = (code.match(/\bend\b/g) || []).length;

	if (ends > openers + 5) {
		return "Possible extra 'end' detected.";
	}

	let paren = 0;
	let square = 0;
	let curly = 0;

	for (const char of code) {
		if (char === "(") paren++;
		if (char === ")") paren--;
		if (char === "[") square++;
		if (char === "]") square--;
		if (char === "{") curly++;
		if (char === "}") curly--;

		if (paren < 0 || square < 0 || curly < 0) {
			return "Possible bracket mismatch detected.";
		}
	}

	if (paren !== 0 || square !== 0 || curly !== 0) {
		return "Possible missing bracket detected.";
	}

	return null;
}

function obfuscateLua() {
	const code = input.value;

	if (!code.trim()) {
		msg("No Lua code to obfuscate.", false);
		return;
	}

	const syntaxIssue = basicSyntaxCheck(code);

	if (syntaxIssue) {
		msg(syntaxIssue, false);
		return;
	}

	const renameVars = getSetting("renameVars");
	const encodeStr = getSetting("encodeStrings");
	const byteEncode = getSetting("byteEncode");
	const junkCode = getSetting("junkCode");
	const level = document.getElementById("junkIntensity").value;

	let result = minify(code);

	if (renameVars) {
		result = renameLocalVariables(result);
	}

	if (encodeStr) {
		result = encodeStrings(result);
	}

	if (junkCode) {
		const junkStart = makeJunkCode(level);
		const junkEnd = makeJunkCode(level);
		result = `${junkStart};${result};${junkEnd}`;
	}

	if (byteEncode) {
		result = makeAdvancedLoader(result, level);
	} else {
		result = makeChunkedStringChar(result, level);
	}

	output.value = result;
	msg("Advanced obfuscation generated. It is harder to casually decode, but no client-side Lua obfuscation is impossible to reverse.");
}

function copyOutput() {
	if (!output.value.trim()) {
		msg("No output to copy.", false);
		return;
	}

	output.select();
	document.execCommand("copy");
	msg("Output copied.");
}

function clearAll() {
	input.value = "";
	output.value = "";
	msg("Cleared.");
}
