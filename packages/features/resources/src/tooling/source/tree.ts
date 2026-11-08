import { lstat, readdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";

/** Capture bounded, regular, non-symbolic files before parsing or compiling any authored source. */
export async function captureResourceSource(root: string): Promise<ReadonlyMap<string, Uint8Array>> {
    if (!(await lstat(root)).isDirectory()) {
        throw new TypeError("Resource source must be a real directory");
    }
    const files = new Map<string, Uint8Array>();
    let bytes = 0;
    let entries = 0;
    const visit = async (directory: string, prefix: string, depth: number): Promise<void> => {
        if (depth > 16) {
            throw new RangeError("Resource source tree exceeds its depth limit");
        }
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            if (++entries > 4096) {
                throw new RangeError("Resource source tree exceeds its entry limit");
            }
            const path = prefix + entry.name;
            const absolute = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolute, path + "/", depth + 1);
                continue;
            }
            if (!entry.isFile() || entry.name.includes("\\") || entry.name !== entry.name.normalize("NFC")) {
                throw new TypeError("Resource sources reject symbolic or ambiguous files: " + path);
            }
            if (entry.name === ".gitkeep") {
                continue;
            }
            const maximum = path.startsWith("assets/") ? 16 * 1024 * 1024 : 1024 * 1024;
            const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
            try {
                const info = await file.stat();
                if (!info.isFile() || info.size > maximum) {
                    throw new RangeError("Resource source file exceeds its limit: " + path);
                }
                const buffer = Buffer.alloc(Math.min(info.size + 1, maximum + 1));
                let size = 0;
                while (size < buffer.length) {
                    const read = await file.read(buffer, size, buffer.length - size, null);
                    if (!read.bytesRead) {
                        break;
                    }
                    size += read.bytesRead;
                }
                if (size !== info.size) {
                    throw new Error("Resource source changed while captured: " + path);
                }
                bytes += size;
                if (bytes > 64 * 1024 * 1024 || files.size >= 2048) {
                    throw new RangeError("Resource source exceeds its aggregate limit");
                }
                files.set(path, buffer.subarray(0, size));
            } finally {
                await file.close();
            }
        }
    };
    await visit(root, "", 0);
    return files;
}
export function sourceJson(files: ReadonlyMap<string, Uint8Array>, path: string): unknown {
    const bytes = files.get(path);
    if (!bytes) {
        throw new TypeError("Missing resource source file: " + path);
    }
    return parseStrictJson(bytes, 1024 * 1024, 64);
}
export function sourceText(bytes: Uint8Array): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
