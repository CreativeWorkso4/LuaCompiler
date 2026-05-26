(function () {
	const VM_VERSION = "Traceless VM Alpha v2.0";

	function randomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function randomName(length = randomInt(8, 16)) {
		const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		let result = chars[randomInt(0, chars.length - 1)];

		for (let i = 1; i < length; i++) {
			result += chars[randomInt(0, chars.length - 1)];
		}

		return result;
	}

	function encodeString(text) {
		const key = randomInt(15, 90);
		const bytes = [];

		for (let i = 0; i < text.length; i++) {
			bytes.push(text.charCodeAt(i) + key);
		}

		return `{${key},{${bytes.join(",")}}}`;
	}

	function cleanLua(code) {
		return String(code || "")
			.replace(/[“”]/g, '"')
			.replace(/[‘’]/g, "'")
			.split(/\r?\n/)
			.map(line => line.replace(/--.*$/g, "").trim())
			.filter(Boolean)
			.join("\n");
	}

	function splitArgs(text) {
		const args = [];
		let current = "";
		let quote = null;
		let depth = 0;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i];

			if (quote) {
				current += ch;

				if (ch === "\\" && i + 1 < text.length) {
					current += text[i + 1];
					i++;
					continue;
				}

				if (ch === quote) {
					quote = null;
				}

				continue;
			}

			if (ch === '"' || ch === "'") {
				quote = ch;
				current += ch;
				continue;
			}

			if (ch === "(") depth++;
			if (ch === ")") depth--;

			if (ch === "," && depth === 0) {
				args.push(current.trim());
				current = "";
				continue;
			}

			current += ch;
		}

		if (current.trim()) {
			args.push(current.trim());
		}

		return args;
	}

	function isStringLiteral(expr) {
		return /^(['"])([\s\S]*)\1$/.test(expr.trim());
	}

	function unquote(expr) {
		expr = expr.trim();
		return expr.slice(1, -1);
	}

	function compileValue(expr) {
		expr = expr.trim();

		if (isStringLiteral(expr)) {
			return `{1,${encodeString(unquote(expr))}}`;
		}

		if (/^-?\d+(\.\d+)?$/.test(expr)) {
			return `{2,${expr}}`;
		}

		if (expr === "true") {
			return `{3,true}`;
		}

		if (expr === "false") {
			return `{3,false}`;
		}

		if (expr === "nil") {
			return `{4}`;
		}

		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
			return `{5,${encodeString(expr)}}`;
		}

		throw new Error(`Unsupported value/expression: ${expr}`);
	}

	function findTopLevelOperator(expr) {
		let quote = null;
		let depth = 0;
		const operators = ["+", "-", "*", "/"];

		for (const op of operators) {
			for (let i = expr.length - 1; i >= 0; i--) {
				const ch = expr[i];

				if (quote) {
					if (ch === quote) quote = null;
					continue;
				}

				if (ch === '"' || ch === "'") {
					quote = ch;
					continue;
				}

				if (ch === ")") depth++;
				if (ch === "(") depth--;

				if (depth === 0 && ch === op) {
					if (i === 0 && op === "-") continue;

					return {
						index: i,
						operator: op
					};
				}
			}
		}

		return null;
	}

	function compileExpressionToInstruction(target, expr) {
		expr = expr.trim();

		const getServiceMatch = expr.match(/^game:GetService\((["'])(.*?)\1\)$/);
		if (getServiceMatch) {
			return `{7,${encodeString(target)},${encodeString(getServiceMatch[2])}}`;
		}

		const methodMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\:([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
		if (methodMatch) {
			const objectName = methodMatch[1];
			const methodName = methodMatch[2];
			const rawArgs = methodMatch[3].trim();
			const args = rawArgs ? splitArgs(rawArgs).map(compileValue) : [];

			return `{10,${encodeString(target)},${encodeString(objectName)},${encodeString(methodName)},{${args.join(",")}}}`;
		}

		const propMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
		if (propMatch) {
			return `{8,${encodeString(target)},${encodeString(propMatch[1])},${encodeString(propMatch[2])}}`;
		}

		const opInfo = findTopLevelOperator(expr);
		if (opInfo) {
			const left = expr.slice(0, opInfo.index).trim();
			const right = expr.slice(opInfo.index + 1).trim();

			const opMap = {
				"+": 2,
				"-": 3,
				"*": 4,
				"/": 5
			};

			return `{${opMap[opInfo.operator]},${encodeString(target)},${compileValue(left)},${compileValue(right)}}`;
		}

		return `{1,${encodeString(target)},${compileValue(expr)}}`;
	}

	function compileLuaToBytecode(code) {
		code = cleanLua(code);

		const lines = code.split(/\r?\n/);
		const instructions = [];

		for (const line of lines) {
			let match;

			match = line.match(/^local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
			if (match) {
				const target = match[1];
				const expr = match[2];
				instructions.push(compileExpressionToInstruction(target, expr));
				continue;
			}

			match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
			if (match) {
				instructions.push(`{9,${encodeString(match[1])},${encodeString(match[2])},${compileValue(match[3])}}`);
				continue;
			}

			match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
			if (match) {
				const target = match[1];
				const expr = match[2];
				instructions.push(compileExpressionToInstruction(target, expr));
				continue;
			}

			match = line.match(/^print\((.*)\)$/);
			if (match) {
				const args = splitArgs(match[1]).map(compileValue);
				instructions.push(`{6,{${args.join(",")}}}`);
				continue;
			}

			throw new Error(`Unsupported Lua line in VM Alpha: ${line}`);
		}

		return instructions;
	}

	function makeRuntime(bytecode) {
		const R = randomName();
		const D = randomName();
		const V = randomName();
		const C = randomName();
		const I = randomName();
		const O = randomName();
		const A = randomName();
		const B = randomName();
		const T = randomName();
		const targetName = randomName();

		return `-- ${VM_VERSION}
-- Protected by Traceless VM Mode

local ${R}={}
local ${D}=function(x)
	local k=x[1]
	local b=x[2]
	local o={}
	for i,v in ipairs(b) do
		o[i]=string.char(v-k)
	end
	return table.concat(o)
end

local ${V}=function(x)
	local t=x[1]
	if t==1 then
		return ${D}(x[2])
	elseif t==2 then
		return x[2]
	elseif t==3 then
		return x[2]
	elseif t==4 then
		return nil
	elseif t==5 then
		return ${R}[${D}(x[2])]
	end
end

local ${C}={
${bytecode.join(",\n")}
}

for _,${I} in ipairs(${C}) do
	local ${O}=${I}[1]

	if ${O}==1 then
		${R}[${D}(${I}[2])]=${V}(${I}[3])

	elseif ${O}==2 then
		${R}[${D}(${I}[2])]=${V}(${I}[3])+${V}(${I}[4])

	elseif ${O}==3 then
		${R}[${D}(${I}[2])]=${V}(${I}[3])-${V}(${I}[4])

	elseif ${O}==4 then
		${R}[${D}(${I}[2])]=${V}(${I}[3])*${V}(${I}[4])

	elseif ${O}==5 then
		${R}[${D}(${I}[2])]=${V}(${I}[3])/${V}(${I}[4])

	elseif ${O}==6 then
		local ${A}={}
		for i,v in ipairs(${I}[2]) do
			${A}[i]=${V}(v)
		end
		print(table.unpack(${A}))

	elseif ${O}==7 then
		${R}[${D}(${I}[2])]=game:GetService(${D}(${I}[3]))

	elseif ${O}==8 then
		${R}[${D}(${I}[2])]=${R}[${D}(${I}[3])][${D}(${I}[4])]

	elseif ${O}==9 then
		${R}[${D}(${I}[2])][${D}(${I}[3])]=${V}(${I}[4])

	elseif ${O}==10 then
		local ${targetName}=${D}(${I}[2])
		local ${T}=${R}[${D}(${I}[3])]
		local methodName=${D}(${I}[4])
		local ${B}={}
		for i,v in ipairs(${I}[5]) do
			${B}[i]=${V}(v)
		end
		${R}[${targetName}]=${T}[methodName](${T},table.unpack(${B}))
	end
end`;
	}

	function obfuscateLuaVM(code) {
		const bytecode = compileLuaToBytecode(code);
		return makeRuntime(bytecode);
	}

	window.TracelessVM = {
		obfuscateLuaVM,
		VM_VERSION
	};
})();
