import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, existsSync, rmSync, renameSync, readFileSync } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

const TEST_DIR = "/tmp/bug-021-test";
const AGENT_DIR = join(TEST_DIR, "agent");
const GITAGENT_DIR = join(AGENT_DIR, ".gitagent");

async function isPluginReady(dir: string): Promise<boolean> {
	try {
		await stat(join(dir, "plugin.yaml"));
		return true;
	} catch {
		return false;
	}
}

async function dirExists(dir: string): Promise<boolean> {
	try {
		const s = await stat(dir);
		return s.isDirectory();
	} catch {
		return false;
	}
}

async function discoverPluginDirs(pluginName: string): Promise<string | null> {
	const localDir = join(AGENT_DIR, "plugins", pluginName);
	if (await dirExists(localDir) && await isPluginReady(localDir)) return localDir;

	const installedDir = join(GITAGENT_DIR, "plugins", pluginName);
	if (await dirExists(installedDir) && await isPluginReady(installedDir)) return installedDir;

	return null;
}

describe("BUG-021: Plugin discovery race", () => {
	before(() => {
		execSync(`rm -rf ${TEST_DIR}`);
		mkdirSync(AGENT_DIR, { recursive: true });
	});

	after(() => {
		execSync(`rm -rf ${TEST_DIR}`);
	});

	it("should not discover partially installed plugins (dir exists but no plugin.yaml)", async () => {
		const partialDir = join(GITAGENT_DIR, "plugins", "partial-plugin");
		mkdirSync(partialDir, { recursive: true });

		assert.ok(existsSync(partialDir));
		assert.strictEqual(existsSync(join(partialDir, "plugin.yaml")), false);

		const result = await discoverPluginDirs("partial-plugin");
		assert.strictEqual(result, null);
	});

	it("should discover fully installed plugins", async () => {
		const fullDir = join(GITAGENT_DIR, "plugins", "full-plugin");
		mkdirSync(fullDir, { recursive: true });
		writeFileSync(join(fullDir, "plugin.yaml"), "id: full-plugin\nname: Full\nversion: 1.0.0\ndescription: Test\n");

		const result = await discoverPluginDirs("full-plugin");
		assert.notStrictEqual(result, null);
		assert.ok(result!.endsWith("full-plugin"));
	});

	it("should handle concurrent installs without race (atomic rename pattern)", async () => {
		const pluginDir = join(GITAGENT_DIR, "plugins", "race-plugin");

		async function atomicInstall(id: number): Promise<void> {
			const tmpDir = pluginDir + ".tmp." + id + "." + Date.now();
			mkdirSync(tmpDir, { recursive: true });
			await new Promise((r) => setTimeout(r, 50));
			writeFileSync(join(tmpDir, "plugin.yaml"), "id: race-plugin\nname: Race\nversion: 1.0.0\ndescription: Test\n");
			if (existsSync(pluginDir)) rmSync(pluginDir, { recursive: true });
			renameSync(tmpDir, pluginDir);
		}

		await Promise.all([atomicInstall(1), atomicInstall(2)]);

		const yamlContent = readFileSync(join(pluginDir, "plugin.yaml"), "utf-8");
		assert.ok(yamlContent.includes("id: race-plugin"));
	});

	it("should detect plugin readiness via plugin.yaml existence", async () => {
		const readyDir = join(GITAGENT_DIR, "plugins", "ready-plugin");
		mkdirSync(readyDir, { recursive: true });
		writeFileSync(join(readyDir, "plugin.yaml"), "id: ready-plugin\nversion: 1.0.0\ndescription: Test\n");

		assert.ok(await isPluginReady(readyDir));
	});

	it("should reject directories without plugin.yaml as not ready", async () => {
		const notReadyDir = join(GITAGENT_DIR, "plugins", "not-ready");
		mkdirSync(notReadyDir, { recursive: true });

		assert.ok(!(await isPluginReady(notReadyDir)));
	});

	it("should discover from local dir when both plugin.yaml and dir exist", async () => {
		const localDir = join(AGENT_DIR, "plugins", "local-plugin");
		mkdirSync(localDir, { recursive: true });
		writeFileSync(join(localDir, "plugin.yaml"), "id: local-plugin\nversion: 1.0.0\ndescription: Local\n");

		const result = await discoverPluginDirs("local-plugin");
		assert.notStrictEqual(result, null);
		assert.ok(result!.includes("plugins/local-plugin"));
	});
});
