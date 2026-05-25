import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-004: Channel push after abort guard", () => {
	it("should drop pushes after finish", () => {
		let done = false;
		const buffer: string[] = [];

		const channel = {
			push(v: string) {
				if (done) return;
				buffer.push(v);
			},
			finish() {
				done = true;
			},
		};

		channel.push("a");
		channel.push("b");
		assert.equal(buffer.length, 2, "Should accept before finish");

		channel.finish();
		channel.push("c");
		assert.equal(buffer.length, 2, "Should drop after finish");
	});
});
