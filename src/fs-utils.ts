import { mkdir, writeFile, mkdtemp, rename, rm } from "fs/promises";
import { dirname, join } from "path";
import { tmpdir } from "os";

export async function safeWriteFile(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true }).catch(() => {});
	await writeFile(path, content, "utf-8");
}

export async function atomicWriteFile(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true }).catch(() => {});
	const tmpDir = await mkdtemp(join(tmpdir(), "gitclaw-"));
	const tmpFile = join(tmpDir, "content");
	try {
		await writeFile(tmpFile, content, "utf-8");
		await rename(tmpFile, path);
	} finally {
		await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
}
