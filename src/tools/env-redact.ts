const SAFE_ENV_KEYS = new Set([
	"PATH", "HOME", "USER", "SHELL", "TERM",
	"LANG", "LC_ALL", "TZ", "PWD",
	"TMPDIR", "TEMP", "LOGNAME",
]);

const SENSITIVE_PATTERNS: RegExp[] = [
	/sk-[a-zA-Z0-9]{20,}/g,
	/sk-proj-[a-zA-Z0-9]{20,}/g,
	/gh[opsu]_[a-zA-Z0-9]{36,}/g,
	/AKIA[0-9A-Z]{16}/g,
	/(?<=https:\/\/)[^:@\s]+:[^@\s]+@/g,
	/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----/g,
];

export function createSafeEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {};
	for (const key of SAFE_ENV_KEYS) {
		if (key in process.env) {
			env[key] = process.env[key];
		}
	}
	return env;
}

export function scrubOutput(text: string): string {
	for (const pattern of SENSITIVE_PATTERNS) {
		text = text.replace(pattern, "[REDACTED]");
	}
	return text;
}
