import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function readBoundedJsonDocument(
    path: string,
    maxBytes: number,
): Promise<Readonly<{ value: unknown; bytes: Uint8Array }>> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size < 1 || stats.size > maxBytes) {
            throw new Error("Official repository JSON must be a bounded regular file");
        }
        const buffer = Buffer.alloc(maxBytes + 1);
        let offset = 0;
        while (offset < buffer.byteLength) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
            if (bytesRead === 0) {
                break;
            }
            offset += bytesRead;
        }
        if (offset < 1 || offset > maxBytes) {
            throw new Error("Official repository JSON must be a bounded regular file");
        }
        const bytes = buffer.subarray(0, offset);
        return {
            value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
            bytes,
        };
    } finally {
        await handle.close();
    }
}

export function joinWithin(root: string, source: string): string {
    if (isAbsolute(source)) {
        throw new Error("Official repository path must be relative");
    }
    const target = resolve(root, source);
    assertWithin(root, target);
    return target;
}

export function portableRelative(root: string, target: string): string {
    assertWithin(root, target);
    return relative(root, target).split(sep).join("/");
}

export function assertWithin(root: string, target: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error("Official repository path escapes its root");
    }
}

export function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
