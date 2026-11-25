import { X509Certificate, createPrivateKey } from "node:crypto";
import { opendir, lstat, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicPrivateWrite } from "../../stack/orchestration/deployment/storage";
/** Copy certificate/key pairs only. ACME accounts and mutable source storage remain outside the frontend. */
export async function copyPresentationCertificates(source: string, destination: string, required: readonly string[]) {
    if (!required.length) {
        return 0;
    }
    await mkdir(destination, { mode: 0o700 });
    const missing = new Set(required);
    let files = 0,
        bytes = 0,
        count = 0;
    async function* scan(path: string): AsyncGenerator<string> {
        const directory = await opendir(path);
        for await (const entry of directory) {
            if (++files > 16384 || entry.isSymbolicLink()) {
                throw new Error("Unsafe or oversized certificate inventory");
            }
            const child = join(path, entry.name);
            if (entry.isDirectory()) {
                yield* scan(child);
            } else if (entry.isFile() && child.endsWith(".crt")) {
                yield child;
            }
        }
    }
    const read = async (path: string) => {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || (bytes += stat.size) > 16 * 1024 * 1024) {
            throw new Error("Unsafe or oversized certificate file");
        }
        return readFile(path, "utf8");
    };
    for await (const path of scan(source)) {
        const pem = await read(path);
        const certificate = new X509Certificate(pem);
        const covered = [...missing].filter((host) => certificate.checkHost(host));
        if (
            !covered.length ||
            Date.parse(certificate.validTo) <= Date.now() ||
            Date.parse(certificate.validFrom) > Date.now()
        ) {
            continue;
        }
        const key = await read(path.slice(0, -4) + ".key");
        if (!certificate.checkPrivateKey(createPrivateKey(key))) {
            throw new Error("Maintenance certificate does not match its private key");
        }
        await atomicPrivateWrite(join(destination, `${count}.crt`), pem);
        await atomicPrivateWrite(join(destination, `${count}.key`), key);
        count++;
        for (const host of covered) {
            missing.delete(host);
        }
    }
    if (missing.size) {
        throw new Error("Cannot preserve HTTPS for every ready domain; upgrade refused before stopping services");
    }
    return count;
}
