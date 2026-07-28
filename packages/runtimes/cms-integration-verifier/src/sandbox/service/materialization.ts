import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    computeIntegrationPackageDigest,
    decodeIntegrationPackageFile,
    validateIntegrationPackageEnvelope,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";

const DEFAULT_PACKAGE_CACHE_LIMIT = 4;

export type BoundedPackageMaterializerConfig = Readonly<{
    packageTempRoot?: string;
    maxCachedPackages?: number;
}>;

export function createBoundedPackageMaterializer(config: BoundedPackageMaterializerConfig = {}) {
    const limit = config.maxCachedPackages ?? DEFAULT_PACKAGE_CACHE_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) {
        throw new TypeError("Verification package cache limit must be between 1 and 16");
    }
    const entries = new Map<string, Promise<string>>();
    const roots = new Set<string>();
    let disposed = false;
    return Object.freeze({
        async root(input: IntegrationPackageEnvelopeV1): Promise<string> {
            if (disposed) {
                throw new Error("Verification package materializer is disposed");
            }
            const envelope = validateIntegrationPackageEnvelope(input, { requireReleaseNotes: true });
            const digest = await computeIntegrationPackageDigest(envelope);
            if (disposed) {
                throw new Error("Verification package materializer is disposed");
            }
            const identity = `${envelope.kind}\0${envelope.version}\0${digest}`;
            const existing = entries.get(identity);
            if (existing) {
                return await existing;
            }
            if (entries.size >= limit) {
                throw new Error("Verification package cache reached its exact identity limit");
            }
            const pending = materialize(config.packageTempRoot ?? process.cwd(), envelope, roots).catch((error) => {
                entries.delete(identity);
                throw error;
            });
            entries.set(identity, pending);
            return await pending;
        },
        async dispose(): Promise<void> {
            if (disposed) {
                return;
            }
            disposed = true;
            await Promise.allSettled(entries.values());
            await Promise.all([...roots].map(async (root) => await rm(root, { recursive: true, force: true })));
            entries.clear();
            roots.clear();
        },
    });
}

async function materialize(
    tempRoot: string,
    envelope: IntegrationPackageEnvelopeV1,
    roots: Set<string>,
): Promise<string> {
    const root = await mkdtemp(join(tempRoot, ".cms-verifier-package-"));
    roots.add(root);
    try {
        for (const [path, file] of Object.entries(envelope.files).toSorted(([left], [right]) =>
            left.localeCompare(right),
        )) {
            const destination = join(root, ...path.split("/"));
            await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
            await writeFile(destination, decodeIntegrationPackageFile(file), { flag: "wx", mode: 0o600 });
        }
        return root;
    } catch (error) {
        roots.delete(root);
        await rm(root, { recursive: true, force: true });
        throw error;
    }
}
