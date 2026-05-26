const input = document.getElementById("input");
const output = document.getElementById("output");
const message = document.getElementById("message");

function setMessage(text, good = true) {
	message.textContent = text;
	message.style.color = good ? "#a7f3d0" : "#fb7185";
}

function obfuscateVM() {
	try {
		const code = input.value;

		if (!code.trim()) {
			setMessage("Paste Lua code first.", false);
			return;
		}

		if (!window.TracelessVM || !window.TracelessVM.obfuscateLuaVM) {
			setMessage("VM engine failed to load.", false);
			return;
		}

		const result = window.TracelessVM.obfuscateLuaVM(code);

		output.value = result;
		setMessage("VM obfuscation generated.");
	} catch (err) {
		output.value = "";
		setMessage(err.message || "Failed to obfuscate.", false);
	}
}

function copyOutput() {
	if (!output.value.trim()) {
		setMessage("No output to copy.", false);
		return;
	}

	output.select();
	document.execCommand("copy");
	setMessage("Output copied.");
}

function clearAll() {
	input.value = "";
	output.value = "";
	setMessage("Cleared.");
}

function loadExample() {
	input.value = `local Players = game:GetService("Players")
local plr = Players.LocalPlayer
local Character = plr.Character
local humanoidroot = Character:WaitForChild("HumanoidRootPart")
humanoidroot.Anchored = true`;

	setMessage("Example loaded.");
}
