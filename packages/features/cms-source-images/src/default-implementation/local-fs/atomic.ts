import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, { mode: 0o600 });
        await rename(temporary, path);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
    await atomicWrite(path, new TextEncoder().encode(JSON.stringify(value)));
}
