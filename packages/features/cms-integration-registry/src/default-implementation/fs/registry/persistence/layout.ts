import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";

export type FsIntegrationRegistryLayout = Readonly<{
    root: string;
    staging: string;
    journals: string;
    quarantine: string;
}>;

export type FsIntegrationRegistryPublicationPaths = Readonly<{
    integrationRoot: string;
    versionsRoot: string;
    versionRoot: string;
    stagingRoot: string;
    journal: string;
    index: string;
    manifest: string;
    report: string;
}>;

export async function ensureFsIntegrationRegistryLayout(requestedRoot: string): Promise<FsIntegrationRegistryLayout> {
    const root = await requireCanonicalDirectory(requestedRoot, "registry root");
    return {
        root,
        staging: await ensureChildDirectory(root, ".staging"),
        journals: await ensureChildDirectory(root, ".journals"),
        quarantine: await ensureChildDirectory(root, ".quarantine"),
    };
}

export async function ensurePublicationPaths(
    layout: FsIntegrationRegistryLayout,
    kind: string,
    version: string,
    operationId: string,
): Promise<FsIntegrationRegistryPublicationPaths> {
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    assertOperationId(operationId);
    const integrationRoot = await ensureChildDirectory(layout.root, kind);
    const versionsRoot = await ensureChildDirectory(integrationRoot, "versions");
    const metadata = await ensureChildDirectory(integrationRoot, ".registry");
    const manifests = await ensureChildDirectory(metadata, "manifests");
    const reports = await ensureChildDirectory(metadata, "reports");
    const versionReports = await ensureChildDirectory(reports, version);
    return {
        integrationRoot,
        versionsRoot,
        versionRoot: join(versionsRoot, version),
        stagingRoot: join(layout.staging, operationId),
        journal: join(layout.journals, `${operationId}.json`),
        index: join(integrationRoot, "integration.json"),
        manifest: join(manifests, `${version}.json`),
        report: join(versionReports, "admission.json"),
    };
}

export function publicationPaths(
    layout: FsIntegrationRegistryLayout,
    kind: string,
    version: string,
    operationId: string,
): FsIntegrationRegistryPublicationPaths {
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    assertOperationId(operationId);
    const integrationRoot = join(layout.root, kind);
    return {
        integrationRoot,
        versionsRoot: join(integrationRoot, "versions"),
        versionRoot: join(integrationRoot, "versions", version),
        stagingRoot: join(layout.staging, operationId),
        journal: join(layout.journals, `${operationId}.json`),
        index: join(integrationRoot, "integration.json"),
        manifest: join(integrationRoot, ".registry", "manifests", `${version}.json`),
        report: join(integrationRoot, ".registry", "reports", version, "admission.json"),
    };
}

async function ensureChildDirectory(parent: string, name: string): Promise<string> {
    const path = join(parent, name);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const canonical = await requireCanonicalDirectory(path, `registry directory ${name}`);
    if (canonical !== path) {
        throw new Error(`Integration registry directory must not traverse symlinks: ${path}`);
    }
    return canonical;
}

async function requireCanonicalDirectory(path: string, source: string): Promise<string> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Integration ${source} must be a real non-symlink directory`);
    }
    const canonical = await realpath(path);
    const canonicalMetadata = await lstat(canonical);
    if (metadata.dev !== canonicalMetadata.dev || metadata.ino !== canonicalMetadata.ino) {
        throw new Error(`Integration ${source} changed while resolving its canonical path`);
    }
    return canonical;
}

function assertOperationId(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
        throw new TypeError("Integration registry operation ID must be a path-safe identifier of at most 128 bytes");
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
