import { test } from "node:test";
import { strictEqual } from "node:assert";

const stripAnsi = (s: string): string => {
	return s.replace(/[\x1b\x9b][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nq-uy=><~]/g, "");
};

test("stripAnsi handles simple bold code", () => {
	strictEqual(stripAnsi("\x1b[1mBold\x1b[0m"), "Bold");
});

test("stripAnsi handles 256-color codes", () => {
	strictEqual(stripAnsi("\x1b[38;5;196mRed\x1b[0m"), "Red");
});

test("stripAnsi handles combined bold+red", () => {
	strictEqual(stripAnsi("\x1b[1;31mBoldRed\x1b[0m"), "BoldRed");
});

test("stripAnsi handles dim code", () => {
	strictEqual(stripAnsi("\x1b[2mdim text\x1b[0m"), "dim text");
});

test("stripAnsi leaves plain text unchanged", () => {
	strictEqual(stripAnsi("hello world"), "hello world");
});

test("stripAnsi handles empty string", () => {
	strictEqual(stripAnsi(""), "");
});
