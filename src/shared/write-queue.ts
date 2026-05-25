// Per-file write queue for RACE-009 — serializes concurrent writes to same path

const writeQueues = new Map();

export async function enqueueWrite(
	path: string,
	fn: () => Promise<void>,
): Promise<void> {
	while (true) {
		const prev: Promise<void> = writeQueues.get(path) || Promise.resolve();
		const next = prev.then(fn, fn);
		if (writeQueues.get(path) === prev || !writeQueues.has(path)) {
			writeQueues.set(path, next);
			return next;
		}
	}
}

export function getWriteQueueSize(): number {
	return writeQueues.size;
}
