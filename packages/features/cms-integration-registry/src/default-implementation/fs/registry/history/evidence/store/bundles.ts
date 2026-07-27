import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationVerificationBundleStore,
    StoredIntegrationVerificationBundle,
} from "../../../../../../interfaces/reportStore";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../../persistence/canonicalFile";
import {
    ensureVerifiedRegistryChildDirectory,
    ensureVerifiedRegistryMetadataDirectory,
    readVerifiedRegistryDirectory,
} from "../../../persistence/ownedDirectory";

const MAX_VERIFICATION_BUNDLE_BYTES = 32 * 1_024 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/u;

export class FsIntegrationVerificationBundleStore implements IntegrationVerificationBundleStore {
    constructor(private readonly root: string) {}

    async get(digest: string): Promise<StoredIntegrationVerificationBundle | null> {
        assertDigest(digest);
        try {
            await assertBundleParents(this.root, digest);
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
        const value = await readCanonicalJsonFile(
            bundlePath(bundleStoreRoot(this.root), digest),
            MAX_VERIFICATION_BUNDLE_BYTES,
        );
        if (value === null) {
            return null;
        }
        const envelope = validateIntegrationVerificationEnvelope(value);
        const actualDigest = await computeIntegrationVerificationDigest(envelope);
        if (actualDigest !== digest) {
            throw new Error(`Verification bundle ${digest} does not match its immutable path`);
        }
        return { envelope, canonicalBytes: canonicalJsonBytes(envelope), digest };
    }

    async put(bundle: StoredIntegrationVerificationBundle): Promise<StoredIntegrationVerificationBundle> {
        const envelope = validateIntegrationVerificationEnvelope(bundle.envelope);
        const canonicalBytes = canonicalJsonBytes(envelope);
        const digest = await computeIntegrationVerificationDigest(envelope);
        if (digest !== bundle.digest || !equalBytes(canonicalBytes, bundle.canonicalBytes)) {
            throw new TypeError("Verification bundle identity does not match its canonical envelope");
        }
        const root = await ensureBundleParents(this.root, digest);
        try {
            await writeCanonicalJsonNoReplace(bundlePath(root, digest), envelope, MAX_VERIFICATION_BUNDLE_BYTES);
        } catch (error) {
            if (!isNodeError(error) || error.code !== "EEXIST") {
                throw error;
            }
        }
        const stored = await this.get(digest);
        if (!stored || !equalBytes(stored.canonicalBytes, canonicalBytes)) {
            throw new Error(`Verification bundle ${digest} collided with different immutable content`);
        }
        return stored;
    }
}

function bundleStoreRoot(root: string): string {
    return join(root, ".registry", "verification-bundles", "objects", "sha256");
}

function bundlePath(root: string, digest: string): string {
    return join(root, shard(digest, 0), shard(digest, 1), `${digest}.json`);
}

async function ensureBundleParents(registryRoot: string, digest: string): Promise<string> {
    await readVerifiedRegistryDirectory(registryRoot);
    const metadata = await ensureVerifiedRegistryMetadataDirectory(registryRoot);
    const store = await ensureVerifiedRegistryChildDirectory(metadata, "verification-bundles");
    const objects = await ensureVerifiedRegistryChildDirectory(store, "objects");
    const sha256 = await ensureVerifiedRegistryChildDirectory(objects, "sha256");
    const first = await ensureVerifiedRegistryChildDirectory(sha256, shard(digest, 0));
    await ensureVerifiedRegistryChildDirectory(first, shard(digest, 1));
    return sha256;
}

async function assertBundleParents(registryRoot: string, digest: string): Promise<void> {
    const metadata = join(registryRoot, ".registry");
    const store = join(metadata, "verification-bundles");
    const objects = join(store, "objects");
    const root = join(objects, "sha256");
    await readVerifiedRegistryDirectory(registryRoot);
    await readVerifiedRegistryDirectory(metadata);
    await readVerifiedRegistryDirectory(store);
    await readVerifiedRegistryDirectory(objects);
    await readVerifiedRegistryDirectory(root);
    await readVerifiedRegistryDirectory(join(root, shard(digest, 0)));
    await readVerifiedRegistryDirectory(join(root, shard(digest, 0), shard(digest, 1)));
    const fileMetadata = await lstat(bundlePath(root, digest));
    if (fileMetadata.isSymbolicLink() || !fileMetadata.isFile()) {
        throw new Error(`Verification bundle ${digest} must be a real file`);
    }
}

function shard(digest: string, index: 0 | 1): string {
    assertDigest(digest);
    const character = digest[index] as string;
    const value = Number.parseInt(character, 16);
    return value < 4 ? "0-3" : value < 8 ? "4-7" : value < 12 ? "8-b" : "c-f";
}

function assertDigest(value: string): void {
    if (!SHA256.test(value)) {
        throw new TypeError("Verification bundle digest must be lowercase SHA-256");
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
