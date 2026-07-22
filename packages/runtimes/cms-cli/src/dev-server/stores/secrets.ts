import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SecretStore } from "@bernouy/cms-secrets";
import { isValidSecretKey } from "@bernouy/cms-secrets";

type EnvEntry = {
    key: string;
    value: string;
};

const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/**
 * Dev-only SecretStore backed by `site/.env`.
 *
 * It intentionally reads from disk on every operation so values edited by hand
 * while `p9r dev` is running are visible to gateway requests immediately.
 */
export class LocalFsEnvSecretStore implements SecretStore {
    constructor(private readonly envPath: string) {}

    static forSite(siteDir: string): LocalFsEnvSecretStore {
        return new LocalFsEnvSecretStore(join(siteDir, ".env"));
    }

    async get(key: string): Promise<string | null> {
        return this.readEntries().then((entries) => entries.get(key) ?? null);
    }

    async set(key: string, value: string): Promise<void> {
        const lines = await this.readLines();
        const next: string[] = [];
        let written = false;

        for (const line of lines) {
            const entry = parseEnvLine(line);
            if (entry?.key === key) {
                if (!written) {
                    next.push(formatEnvLine(key, value));
                    written = true;
                }
                continue;
            }
            next.push(line);
        }

        if (!written) {
            next.push(formatEnvLine(key, value));
        }
        await this.writeLines(next);
    }

    async delete(key: string): Promise<void> {
        const lines = await this.readLines();
        await this.writeLines(lines.filter((line) => parseEnvLine(line)?.key !== key));
    }

    async list(): Promise<Array<{ key: string; value: string }>> {
        return Array.from(await this.readEntries(), ([key, value]) => ({ key, value }));
    }

    async listKeys(): Promise<string[]> {
        return Array.from((await this.readEntries()).keys());
    }

    private async readEntries(): Promise<Map<string, string>> {
        const entries = new Map<string, string>();
        for (const line of await this.readLines()) {
            const entry = parseEnvLine(line);
            if (entry && isValidSecretKey(entry.key)) {
                entries.set(entry.key, entry.value);
            }
        }
        return entries;
    }

    private async readLines(): Promise<string[]> {
        const raw = await readFile(this.envPath, "utf-8").catch((error: { code?: string }) => {
            if (error.code === "ENOENT") {
                return "";
            }
            throw error;
        });
        if (!raw) {
            return [];
        }
        const lines = raw.split(/\r?\n/);
        if (lines.at(-1) === "") {
            lines.pop();
        }
        return lines;
    }

    private async writeLines(lines: string[]): Promise<void> {
        await mkdir(dirname(this.envPath), { recursive: true });
        await writeFile(this.envPath, lines.length ? `${lines.join("\n")}\n` : "", { encoding: "utf-8", mode: 0o600 });
        await chmod(this.envPath, 0o600);
    }
}

function parseEnvLine(line: string): EnvEntry | null {
    const match = line.match(ENV_LINE_RE);
    if (!match) {
        return null;
    }
    return { key: match[1]!, value: parseEnvValue(match[2] ?? "") };
}

function parseEnvValue(raw: string): string {
    const value = raw.trimStart();
    if (value.startsWith('"')) {
        return parseDoubleQuotedValue(value);
    }
    if (value.startsWith("'")) {
        return parseSingleQuotedValue(value);
    }
    return parseUnquotedValue(value);
}

function parseDoubleQuotedValue(value: string): string {
    let out = "";
    for (let i = 1; i < value.length; i++) {
        const ch = value[i];
        if (ch === '"') {
            return out;
        }
        if (ch === "\\" && i + 1 < value.length) {
            const next = value[++i]!;
            if (next === "n") {
                out += "\n";
            } else if (next === "r") {
                out += "\r";
            } else if (next === "t") {
                out += "\t";
            } else {
                out += next;
            }
            continue;
        }
        out += ch;
    }
    return out;
}

function parseSingleQuotedValue(value: string): string {
    const end = value.indexOf("'", 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
}

function parseUnquotedValue(value: string): string {
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "#" && (i === 0 || /\s/.test(value[i - 1]!))) {
            return value.slice(0, i).trimEnd();
        }
    }
    return value.trimEnd();
}

function formatEnvLine(key: string, value: string): string {
    return `${key}="${escapeEnvValue(value)}"`;
}

function escapeEnvValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}
