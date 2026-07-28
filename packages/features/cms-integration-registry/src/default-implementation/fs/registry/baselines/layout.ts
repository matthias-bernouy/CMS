import { join } from "node:path";
import {
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
    canonicalJsonBytes,
    sha256Hex,
} from "@bernouy/cms-integration-packages";
import type { ReviewedSchemaBaselineLogicalKey } from "../../../../interfaces/reportStore";
import {
    ensureVerifiedRegistryChildDirectory,
    ensureVerifiedRegistryMetadataDirectory,
    readVerifiedRegistryDirectory,
} from "../persistence/ownedDirectory";

export const REVIEWED_SCHEMA_BASELINE_DIRECTORY = "schema-baselines";

export type FsReviewedSchemaBaselinePaths = Readonly<{
    root: string;
    history: string;
    identity: string;
    revisions: string;
}>;

export function reviewedSchemaBaselineRoot(registryRoot: string): string {
    return join(registryRoot, ".registry", REVIEWED_SCHEMA_BASELINE_DIRECTORY);
}

export function assertReviewedSchemaBaselinePackageIdentity(
    kind: string,
    version: string,
    packageDigest: string,
): void {
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    if (!/^[a-f0-9]{64}$/u.test(packageDigest)) {
        throw new TypeError("Reviewed schema baseline package digest is invalid");
    }
}

export async function reviewedSchemaBaselineKeyDigest(key: ReviewedSchemaBaselineLogicalKey): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(key));
}

export async function reviewedSchemaBaselinePaths(
    registryRoot: string,
    key: ReviewedSchemaBaselineLogicalKey,
): Promise<FsReviewedSchemaBaselinePaths> {
    assertReviewedSchemaBaselinePackageIdentity(key.kind, key.version, key.packageDigest);
    const root = reviewedSchemaBaselineRoot(registryRoot);
    const history = join(root, await reviewedSchemaBaselineKeyDigest(key));
    return { root, history, identity: join(history, "identity.json"), revisions: join(history, "revisions") };
}

export async function ensureReviewedSchemaBaselinePaths(
    registryRoot: string,
    key: ReviewedSchemaBaselineLogicalKey,
): Promise<FsReviewedSchemaBaselinePaths> {
    await readVerifiedRegistryDirectory(registryRoot);
    const metadata = await ensureVerifiedRegistryMetadataDirectory(registryRoot);
    const root = await ensureVerifiedRegistryChildDirectory(metadata, REVIEWED_SCHEMA_BASELINE_DIRECTORY);
    const history = await ensureVerifiedRegistryChildDirectory(root, await reviewedSchemaBaselineKeyDigest(key));
    const revisions = await ensureVerifiedRegistryChildDirectory(history, "revisions");
    return { root, history, identity: join(history, "identity.json"), revisions };
}

export function reviewedSchemaBaselineRevisionFilename(ordinal: number): string {
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 9_999_999_999) {
        throw new TypeError("Reviewed schema baseline ordinal is invalid");
    }
    return `${ordinal.toString().padStart(10, "0")}.json`;
}
