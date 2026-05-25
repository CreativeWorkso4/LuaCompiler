const APP_VERSION = "v1.6";
const APP_NAME = "Traceless";
const WATERMARK_TEXT = "Obfuscated by Traceless";

const input = document.getElementById("input");
const output = document.getElementById("output");
const messages = document.getElementById("messages");

const versionBadge = document.getElementById("versionBadge");
if (versionBadge) {
	versionBadge.textContent = APP_VERSION;
}

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

function randomName(length = randomInt(6, 14)) {
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

function normalizeLuaInput(code) {
	return code
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'");
}

function shuffleArray(array) {
	const copy = array.slice();

	for (let i = copy.length - 1; i > 0; i--) {
		const j = randomInt(0, i);
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
}

function stringToBytes(str) {
	const bytes = [];

	for (let i = 0; i < str.length; i++) {
		bytes.push(str.charCodeAt(i));
	}

	return bytes;
}

function removeComments(code) {
	code = normalizeLuaInput(code);

	let result = "";
	let i = 0;
	let inString = false;
	let quote = "";
	let inLongString = false;

	while (i < code.length) {
		const char = code[i];
		const next = code[i + 1];

		if (inLongString) {
			result += char;

			if (char === "]" && next === "]") {
				result += next;
				i += 2;
				inLongString = false;
				continue;
			}

			i++;
			continue;
		}

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

		if (char === "[" && next === "[") {
			inLongString = true;
			result += char + next;
			i += 2;
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
			if (code[i + 2] === "[" && code[i + 3] === "[") {
				i += 4;

				while (i < code.length && !(code[i] === "]" && code[i + 1] === "]")) {
					i++;
				}

				i += 2;
				continue;
			}

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
	code = normalizeLuaInput(code);

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

function replaceIdentifierOutsideStrings(code, oldName, newName) {
	let result = "";
	let i = 0;
	let inString = false;
	let quote = "";
	let inLongString = false;

	while (i < code.length) {
		const char = code[i];
		const next = code[i + 1];

		if (inLongString) {
			result += char;

			if (char === "]" && next === "]") {
				result += next;
				i += 2;
				inLongString = false;
				continue;
			}

			i++;
			continue;
		}

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

		if (char === "[" && next === "[") {
			inLongString = true;
			result += char + next;
			i += 2;
			continue;
		}

		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			result += char;
			i++;
			continue;
		}

		const before = code[i - 1] || "";
		const after = code[i + oldName.length] || "";

		const isBoundaryBefore = !/[A-Za-z0-9_]/.test(before);
		const isBoundaryAfter = !/[A-Za-z0-9_]/.test(after);

		if (before === "." || before === ":") {
			result += char;
			i++;
			continue;
		}

		if (
			code.slice(i, i + oldName.length) === oldName &&
			isBoundaryBefore &&
			isBoundaryAfter
		) {
			result += newName;
			i += oldName.length;
			continue;
		}

		result += char;
		i++;
	}

	return result;
}

function renameLocalVariables(code) {
	const reserved = new Set([
		"and", "break", "do", "else", "elseif", "end", "false", "for", "function",
		"if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
		"until", "while", "print", "string", "math", "table", "game", "workspace",
		"script", "pairs", "ipairs", "next", "load", "loadstring", "require", "pcall",
		"xpcall", "error", "type", "typeof", "task", "wait", "Vector3", "CFrame",
		"Instance", "Color3", "UDim2", "UDim", "Enum", "BrickColor", "_G", "_ENV",
		"getfenv", "setfenv", "select", "tonumber", "tostring", "newproxy"
	]);

	const map = {};

	const patterns = [
		/\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g,
		/\blocal\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g,
		/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
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

	const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);

	for (const [oldName, newName] of entries) {
		code = replaceIdentifierOutsideStrings(code, oldName, newName);
	}

	return code;
}

function makeLuaByteExpression(byte) {
	const style = randomInt(1, 6);

	if (style === 1) {
		const k = randomInt(5, 80);
		return `(${byte + k}-${k})`;
	}

	if (style === 2) {
		const a = randomInt(1, Math.max(1, byte - 1));
		return `(${a}+${byte - a})`;
	}

	if (style === 3) {
		const k = randomInt(2, 20);
		return `((${byte * k})/${k})`;
	}

	if (style === 4) {
		const k = randomInt(3, 50);
		return `(${byte - k}+${k})`;
	}

	if (style === 5) {
		const a = randomInt(1, 9);
		return `(${byte}+${a}-${a})`;
	}

	const a = randomInt(1, 5);
	const b = randomInt(1, 5);
	return `(${byte}+${a}-${a}+${b}-${b})`;
}

function makeHiddenStringExpression(text) {
	const bytes = stringToBytes(text);
	const parts = bytes.map(byte => `string.char(${makeLuaByteExpression(byte)})`);
	return `(${parts.join("..")})`;
}

function encodeStrings(code) {
	code = normalizeLuaInput(code);

	return code.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, function(match) {
		const raw = match.slice(1, -1);

		if (!raw.length) {
			return match;
		}

		return makeHiddenStringExpression(raw);
	});
}

function encodeLiteralToLuaExpression(text) {
	const keys = [];

	for (let i = 0; i < randomInt(3, 6); i++) {
		keys.push(randomInt(15, 80));
	}

	const data = stringToBytes(text).map((byte, index) => {
		const key = keys[index % keys.length];
		const mode = index % 3;

		if (mode === 0) return byte + key;
		if (mode === 1) return byte + key + 4;
		return byte + key + 9;
	});

	const dataVar = randomName();
	const keyVar = randomName();
	const outVar = randomName();
	const iVar = randomName();
	const vVar = randomName();
	const kVar = randomName();
	const mVar = randomName();
	const cVar = randomName();

	return `(function()
local ${dataVar}={${data.join(",")}}
local ${keyVar}={${keys.join(",")}}
local ${outVar}={}
for ${iVar},${vVar} in ipairs(${dataVar}) do
	local ${kVar}=${keyVar}[((${iVar}-1)%#${keyVar})+1]
	local ${mVar}=(${iVar}-1)%3
	if ${mVar}==0 then
		${cVar}=${vVar}-${kVar}
	elseif ${mVar}==1 then
		${cVar}=${vVar}-${kVar}-4
	else
		${cVar}=${vVar}-${kVar}-9
	end
	${outVar}[${iVar}]=_G[string.char(115,116,114,105,110,103)][string.char(99,104,97,114)](${cVar})
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
		"environment blocked",
		"service locked",
		"invalid constant pool",
		"bad proto signature"
	];

	for (let i = 0; i < amount; i++) {
		const flag = randomName();
		const fake = fakeErrors[randomInt(0, fakeErrors.length - 1)];
		const fakeExpr = encodeLiteralToLuaExpression(fake);

		const style = randomInt(1, 5);

		if (style === 1) {
			lines.push(`local ${flag}=false;if ${flag} then error(${fakeExpr}) end`);
		} else if (style === 2) {
			lines.push(`pcall(function() if false then error(${fakeExpr}) end end)`);
		} else if (style === 3) {
			lines.push(`local ${flag}=0;if ${flag}>999999 then error(${fakeExpr}) end`);
		} else if (style === 4) {
			lines.push(`do local ${flag}=nil;if ${flag}~=nil then error(${fakeExpr}) end end`);
		} else {
			lines.push(`xpcall(function() if 1==2 then error(${fakeExpr}) end end,function() return nil end)`);
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

		const style = randomInt(1, 9);

		if (style === 1) {
			junk.push(`local ${a}=${n1}`);
		} else if (style === 2) {
			junk.push(`local ${a}=false;if ${a} then local ${b}=${n2} end`);
		} else if (style === 3) {
			junk.push(`local function ${a}(${b}) return (${b} or ${n1})+${n2} end`);
		} else if (style === 4) {
			junk.push(`local ${a}={};local ${b}=${a};${b}[${randomInt(1, 9)}]=${n1}`);
		} else if (style === 5) {
			junk.push(`do local ${a}=${makeHiddenStringExpression(randomName(4))};local ${b}=#${a} end`);
		} else if (style === 6) {
			junk.push(`local ${a}=function() return ${n1} end;local ${b}=${a}()`);
		} else if (style === 7) {
			junk.push(`local ${a},${b},${c}=${n1},${n2},false;if ${c} then ${d}=${a}+${b} end`);
		} else if (style === 8) {
			junk.push(`do local ${a}={${randomInt(1, 9)},${randomInt(10, 99)},${randomInt(100, 999)}};local ${b}=0;for _,${c} in ipairs(${a}) do ${b}=${b}+${c} end end`);
		} else {
			junk.push(`local ${a}=pcall(function() return ${n1}+${n2} end)`);
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
		const mode = i % 5;

		if (mode === 0) {
			encoded.push(charCode + key);
		} else if (mode === 1) {
			encoded.push(charCode + key + 3);
		} else if (mode === 2) {
			encoded.push(charCode + key + 7);
		} else if (mode === 3) {
			encoded.push(charCode + key + 11);
		} else {
			encoded.push(charCode + key + 17);
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

function getWatermarkSum() {
	let expectedSum = 0;

	for (let i = 0; i < WATERMARK_TEXT.length; i++) {
		expectedSum += WATERMARK_TEXT.charCodeAt(i);
	}

	return expectedSum;
}

function makeWatermarkGuard() {
	const wmKey = "TRC_" + randomName(12);
	const wmLenVar = randomName();
	const wmSumVar = randomName();
	const wmExpectedLen = WATERMARK_TEXT.length;
	const wmExpectedSum = getWatermarkSum();
	const wmKeyExpression = `_G[${makeHiddenStringExpression(wmKey)}]`;

	const lua = `([[${WATERMARK_TEXT}]]):gsub("(.+)",function(v)
	${wmKeyExpression}=v
	return v
end)

local ${wmLenVar}=#${wmKeyExpression}
local ${wmSumVar}=0

for i=1,#${wmKeyExpression} do
	${wmSumVar}=${wmSumVar}+string.byte(${wmKeyExpression},i)
end

if ${wmLenVar}~=${wmExpectedLen} or ${wmSumVar}~=${wmExpectedSum} then
	error(${makeHiddenStringExpression("Traceless watermark missing or modified")})
end`;

	return {
		code: lua,
		varName: wmKeyExpression,
		lenVar: wmLenVar,
		sumVar: wmSumVar,
		expectedLen: wmExpectedLen,
		expectedSum: wmExpectedSum
	};
}

function makeWatermarkDecodeOffset(watermark) {
	return `((${watermark.lenVar}-${watermark.expectedLen})+(${watermark.sumVar}-${watermark.expectedSum}))`;
}

function makeAdvancedLoader(source, level) {
	const watermark = makeWatermarkGuard();
	const wmOffset = makeWatermarkDecodeOffset(watermark);

	const keys = [];

	for (let i = 0; i < randomInt(6, 11); i++) {
		keys.push(randomInt(20, 160));
	}

	const encoded = encodeBytesAdvanced(source, keys);
	const chunks = chunkArray(encoded);

	const fakeChunkCount = level === "high"
		? randomInt(6, 12)
		: level === "medium"
			? randomInt(3, 6)
			: randomInt(1, 3);

	const allChunkObjects = chunks.map((chunk, index) => ({
		real: true,
		index,
		data: chunk
	}));

	for (let i = 0; i < fakeChunkCount; i++) {
		const fakeLength = randomInt(8, 30);
		const fake = [];

		for (let j = 0; j < fakeLength; j++) {
			fake.push(randomInt(30, 360));
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
${watermark.code}
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
		local ${modeVar}=#${buildVar}%5
		if ${modeVar}==0 then
			${charVar}=${bVar}-${kVar}
		elseif ${modeVar}==1 then
			${charVar}=${bVar}-${kVar}-3
		elseif ${modeVar}==2 then
			${charVar}=${bVar}-${kVar}-7
		elseif ${modeVar}==3 then
			${charVar}=${bVar}-${kVar}-11
		else
			${charVar}=${bVar}-${kVar}-17
		end
		${buildVar}[#${buildVar}+1]=${hidden.envVar}[string.char(${stringBytes})][string.char(${charBytes})](${charVar}+${wmOffset})
	end
end
${junkAfter}
local ${loaderVar}=${hidden.getVar}({${loadstringBytes}}) or ${hidden.getVar}({${loadBytes}})
${loaderVar}(${hidden.envVar}[string.char(${tableBytes})][string.char(${concatBytes})](${buildVar}))()
`.trim();
}

function makeChunkedStringChar(source, level) {
	const watermark = makeWatermarkGuard();
	const wmOffset = makeWatermarkDecodeOffset(watermark);

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
	let lua = watermark.code + "\n" + makeJunkCode(level) + "\n";

	for (const chunk of chunks) {
		const inner = chunk.bytes
			.map(pair => `string.char((${makeLuaByteExpression(pair[0])}-${makeLuaByteExpression(pair[1])})+${wmOffset})`)
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
	code = normalizeLuaInput(code);

	const openers = (code.match(/\b(function|then|do)\b/g) || []).length;
	const ends = (code.match(/\bend\b/g) || []).length;

	if (ends > openers + 8) {
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
	const code = normalizeLuaInput(input.value);

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
	msg("Traceless obfuscation generated. v1.6 watermark now affects decode math.");
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
