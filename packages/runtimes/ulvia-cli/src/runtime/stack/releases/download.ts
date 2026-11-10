import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parseStackRelease } from "./model";
import type { StackRelease } from "./model";

const REGISTRY = "https://registry.npmjs.org";
const MAX_ARCHIVE = 16 * 1024 * 1024;

/** Exact official npm release, registry-bound URLs, bounded bytes and npm SHA-512 integrity. */
export async function downloadStackRelease(version: string, request: typeof fetch = fetch): Promise<StackRelease> {
    const metadata = JSON.parse(
        (
            await readResponse(
                await request(`${REGISTRY}/@cyaxis%2Fulvia/${version}`, {
                    redirect: "manual",
                    signal: AbortSignal.timeout(15_000),
                }),
                65_536,
            )
        ).toString(),
    ) as { name?: string; version?: string; dist?: { tarball?: string; integrity?: string } };
    if (
        metadata.name !== "@cyaxis/ulvia" ||
        metadata.version !== version ||
        !metadata.dist?.tarball ||
        !metadata.dist.integrity
    ) {
        throw new Error("Invalid official stack release metadata");
    }
    const endpoint = new URL(metadata.dist.tarball);
    if (
        endpoint.origin !== REGISTRY ||
        endpoint.pathname !== `/@cyaxis/ulvia/-/ulvia-${version}.tgz` ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.username ||
        endpoint.password
    ) {
        throw new Error("Refusing foreign stack release archive");
    }
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/u.test(metadata.dist.integrity)) {
        throw new Error("Stack release requires SHA-512 archive integrity");
    }
    const archive = await readResponse(
        await request(endpoint, { redirect: "manual", signal: AbortSignal.timeout(30_000) }),
        MAX_ARCHIVE,
    );
    const expected = Buffer.from(metadata.dist.integrity.slice(7), "base64");
    const actual = createHash("sha512").update(archive).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new Error("Stack release archive integrity mismatch");
    }
    const release = parseStackRelease(JSON.parse(extractRelease(archive)));
    if (release.version !== version) {
        throw new Error("Stack release version does not match the requested version");
    }
    return release;
}

/** Read one regular tar member in memory; never extract archive paths onto the host. */
export function extractRelease(archive: Uint8Array): string {
    const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
    let result: string | undefined;
    for (let offset = 0, count = 0; offset + 512 <= tar.length; count++) {
        if (count > 4096) {
            throw new Error("Stack release archive has too many entries");
        }
        const header = tar.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) {
            break;
        }
        const field = (start: number, end: number) => header.subarray(start, end).toString().replace(/\0.*$/su, "");
        const sizeText = field(124, 136).trim();
        if (!/^[0-7]+$/u.test(sizeText)) {
            throw new Error("Invalid stack release tar size");
        }
        const size = Number.parseInt(sizeText, 8);
        if (!Number.isSafeInteger(size) || offset + 512 + size > tar.length) {
            throw new Error("Truncated stack release archive");
        }
        const name = [field(345, 500), field(0, 100)].filter(Boolean).join("/");
        if (name === "package/dist/stack-release.json") {
            if (result !== undefined || ![0, 48].includes(header[156]!) || size > 256 * 1024) {
                throw new Error("Invalid or duplicate stack release archive entry");
            }
            result = tar.subarray(offset + 512, offset + 512 + size).toString();
        }
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    if (result === undefined) {
        throw new Error("Official CLI archive has no stack release");
    }
    return result;
}

async function readResponse(response: Response, max: number): Promise<Buffer> {
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`Stack release request refused (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            size += next.value.byteLength;
            if (size > max) {
                throw new Error("Stack release response is too large");
            }
            chunks.push(next.value);
        }
        return Buffer.concat(chunks);
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
