import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { isIPv4, isIPv6 } from "net";

// Standalone copy of checkSSRF for testing (actual in src/tools/shared.ts)

const PRIVATE_IPV4_RANGES = [
	/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
	/^192\.168\.\d{1,3}\.\d{1,3}$/,
	/^169\.254\.\d{1,3}\.\d{1,3}$/,
	/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
];

const BLOCKED_HOSTNAMES = [
	/metadata\.google\.internal/i,
	/metadata\.google\.compute/i,
	/kubernetes\.default\.svc/i,
	/kubernetes\.default/i,
	/\.internal$/i,
	/^internal\./i,
	/^localhost$/i,
];

const DOCKER_SOCKET_PATTERN = /--unix-socket\s+\S*\/docker\.sock/i;
const NETWORK_TOOLS_PATTERN = /(?:^|\s+)(curl|wget|fetch)(?:\s+|$)/i;
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/gi;

function extractHostname(url: string): string | null {
	const match = url.match(/https?:\/\/(?:\[([^\]]+)\]|(?:[^@\s]+@)?([^\/:\s]+))/i);
	if (!match) return null;
	return (match[1] || match[2]).toLowerCase();
}

function checkSSRF(command: string): void {
	const trimmed = command.trim();

	if (DOCKER_SOCKET_PATTERN.test(trimmed)) {
		throw new Error("Command blocked (SSRF prevention): Docker socket access via --unix-socket is not allowed");
	}

	if (!NETWORK_TOOLS_PATTERN.test(trimmed)) return;

	const urls = trimmed.match(URL_PATTERN);
	if (!urls) return;

	for (const url of urls) {
		const hostname = extractHostname(url);
		if (!hostname) continue;

		for (const pattern of BLOCKED_HOSTNAMES) {
			if (pattern.test(hostname)) {
				throw new Error(`Command blocked (SSRF prevention): hostname "${hostname}" is not allowed`);
			}
		}

		const cleanHostname = hostname.replace(/^\[|\]$/g, "");

		if (isIPv4(cleanHostname)) {
			for (const range of PRIVATE_IPV4_RANGES) {
				if (range.test(cleanHostname)) {
					throw new Error(`Command blocked (SSRF prevention): private IP "${cleanHostname}" is not allowed`);
				}
			}
		}

		if (isIPv6(cleanHostname)) {
			const h = cleanHostname.toLowerCase();
			const isPrivate =
				h === "::1" ||
				h === "0:0:0:0:0:0:0:1" ||
				h.startsWith("fc") ||
				h.startsWith("fd") ||
				h.startsWith("fe80") ||
				h === "::" ||
				h === "0:0:0:0:0:0:0:0";
			if (isPrivate) {
				throw new Error(`Command blocked (SSRF prevention): private IPv6 address "${cleanHostname}" is not allowed`);
			}
		}
	}
}

describe("checkSSRF", () => {
	// Private IP blocks
	it("blocks curl to 127.x.x.x", () => {
		assert.throws(() => checkSSRF("curl http://127.0.0.1/"), /private IP/);
	});

	it("blocks curl to 10.x.x.x", () => {
		assert.throws(() => checkSSRF("curl http://10.0.0.1/admin"), /private IP/);
	});

	it("blocks curl to 172.16-31.x.x", () => {
		assert.throws(() => checkSSRF("curl http://172.16.0.1/"), /private IP/);
		assert.throws(() => checkSSRF("curl http://172.31.255.255/"), /private IP/);
	});

	it("blocks curl to 192.168.x.x", () => {
		assert.throws(() => checkSSRF("curl http://192.168.1.1/"), /private IP/);
	});

	it("blocks curl to 169.254.x.x (link-local)", () => {
		assert.throws(() => checkSSRF("curl http://169.254.169.254/latest/meta-data/"), /private IP/);
	});

	it("blocks curl to 0.x.x.x", () => {
		assert.throws(() => checkSSRF("curl http://0.0.0.0/"), /private IP/);
	});

	it("blocks curl to 100.64-127.x.x (CGNAT)", () => {
		assert.throws(() => checkSSRF("curl http://100.64.0.1/"), /private IP/);
		assert.throws(() => checkSSRF("curl http://100.127.255.255/"), /private IP/);
	});

	// Hostname blocks
	it("blocks curl to metadata.google.internal", () => {
		assert.throws(
			() => checkSSRF("curl http://metadata.google.internal/computeMetadata/v1/"),
			/hostname/,
		);
	});

	it("blocks curl to metadata.google.compute", () => {
		assert.throws(
			() => checkSSRF("curl http://metadata.google.compute/"),
			/hostname/,
		);
	});

	it("blocks wget to kubernetes.default.svc", () => {
		assert.throws(
			() => checkSSRF("wget http://kubernetes.default.svc/api/"),
			/hostname/,
		);
	});

	it("blocks curl to .internal domains", () => {
		assert.throws(
			() => checkSSRF("curl http://internal.corp.network/admin"),
			/hostname/,
		);
	});

	it("blocks fetch to localhost", () => {
		assert.throws(
			() => checkSSRF("fetch http://localhost:8080/"),
			/hostname/,
		);
	});

	// IPv6 blocks
	it("blocks curl to IPv6 loopback [::1]", () => {
		assert.throws(() => checkSSRF("curl http://[::1]:8080/"), /private IPv6/);
	});

	it("blocks curl to IPv6 unique-local fc00::/7", () => {
		assert.throws(() => checkSSRF("curl http://[fc00::1]/"), /private IPv6/);
		assert.throws(() => checkSSRF("curl http://[fd00::1]/"), /private IPv6/);
	});

	it("blocks curl to IPv6 link-local fe80::", () => {
		assert.throws(() => checkSSRF("curl http://[fe80::1]/"), /private IPv6/);
	});

	// Docker socket
	it("blocks curl --unix-socket to docker socket", () => {
		assert.throws(
			() => checkSSRF("curl --unix-socket /var/run/docker.sock http://localhost/containers/json"),
			/Docker socket/,
		);
	});

	// Public / allowed
	it("allows curl to public IP", () => {
		assert.doesNotThrow(() => checkSSRF("curl http://93.184.216.34/"));
	});

	it("allows curl to public domain", () => {
		assert.doesNotThrow(() => checkSSRF("curl https://api.example.com/v1/data"));
	});

	it("allows curl to public domain on custom port", () => {
		assert.doesNotThrow(() => checkSSRF("curl http://example.com:3000/health"));
	});

	it("allows curl to subdomain of public domain", () => {
		assert.doesNotThrow(() => checkSSRF("curl https://sub.api.example.com/data"));
	});

	// Non-network commands pass through
	it("passes non-network commands through", () => {
		assert.doesNotThrow(() => checkSSRF("ls -la /tmp"));
		assert.doesNotThrow(() => checkSSRF("git status"));
		assert.doesNotThrow(() => checkSSRF("npm run build"));
	});

	// Edge cases
	it("blocks curl with -L flag to private IP", () => {
		assert.throws(() => checkSSRF("curl -L http://192.168.1.1/"), /private IP/);
	});

	it("blocks wget to private IP with auth in URL", () => {
		assert.throws(() => checkSSRF("wget http://user:pass@10.0.0.1/"), /private IP/);
	});

	it("blocks HTTPS to private IP", () => {
		assert.throws(() => checkSSRF("curl https://169.254.169.254/"), /private IP/);
	});
});
