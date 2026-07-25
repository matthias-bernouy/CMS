import { extname } from "node:path";
import { decodeIntegrationPackageFile, type IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationAsset } from "@bernouy/cms-integrations";

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
});

export async function readSnapshotIntegrationAsset(
    packages: IntegrationPackageSource,
    kind: string,
    version: string,
    path: string,
): Promise<IntegrationAsset | null> {
    if (!path.startsWith("assets/")) {
        return null;
    }
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
    if (!contentType) {
        return null;
    }
    const resolvedPackage = await packages.getPackage(kind, version);
    const file = resolvedPackage?.envelope.files[path];
    return file ? { bytes: decodeIntegrationPackageFile(file), contentType } : null;
}
