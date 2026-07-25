import type { SourceImageDerivative } from "@bernouy/cms-source-images";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function localCacheTestFixture(): {
    cacheRoot(): Promise<string>;
    cleanup(): Promise<void>;
} {
    const roots: string[] = [];
    return {
        async cacheRoot() {
            const root = await mkdtemp(join(tmpdir(), "source-image-cache-"));
            roots.push(root);
            return root;
        },
        async cleanup() {
            await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
        },
    };
}

export async function derivative(label: string, createdAt = Date.now()): Promise<SourceImageDerivative> {
    const bytes = new TextEncoder().encode(label);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    return {
        bytes,
        etag: `"sha256-${digest}"`,
        contentType: "image/webp",
        width: 64,
        height: 32,
        createdAt,
    };
}
