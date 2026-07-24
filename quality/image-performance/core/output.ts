import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAFE_LABEL = /^[a-zA-Z0-9._-]{1,80}$/;

export function safeLabel(value: string): string {
    if (!SAFE_LABEL.test(value)) {
        throw new Error("Labels and adapter names must contain only letters, numbers, dot, dash, or underscore");
    }
    return value;
}

export async function writeJsonArtifact(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
