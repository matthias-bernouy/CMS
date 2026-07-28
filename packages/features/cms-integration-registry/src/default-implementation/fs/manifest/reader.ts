import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type {
    IntegrationPackageEnvelopeV1,
    IntegrationPackageLimits,
    ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    canonicalJsonBytes,
    resolveIntegrationPackageLimits,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import { assertExactIntegrationVersion } from "@bernouy/cms-integrations";
import {
    equalBytes,
    INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA,
    manifestDocumentByteLimit,
    type IntegrationRegistryVersionManifestV1,
} from "./contract";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export type ReadIntegrationRegistryVersionManifestOptions = Readonly<{
    path: string;
    integrationRoot: string;
    expectedKind: string;
    expectedVersion: string;
    limits?: Partial<IntegrationPackageLimits>;
}>;

export type ReadIntegrationRegistryVersionManifestResult = ResolvedIntegrationPackage &
    Readonly<{
        document: IntegrationRegistryVersionManifestV1;
        path: string;
    }>;

export async function readIntegrationRegistryVersionManifest(
    options: ReadIntegrationRegistryVersionManifestOptions,
): Promise<ReadIntegrationRegistryVersionManifestResult | null> {
    assertExactIntegrationVersion(options.expectedVersion, "version");
    const limits = resolveIntegrationPackageLimits(options.limits);
    let bytes: Uint8Array;
    try {
        await assertManifestWithinIntegrationRoot(options.integrationRoot, options.path);
        bytes = await readStableFile(options.path, manifestDocumentByteLimit(limits));
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
    let value: unknown;
    try {
        value = JSON.parse(utf8.decode(bytes));
    } catch (error) {
        throw new Error(`Invalid integration registry version manifest JSON: ${errorMessage(error)}`);
    }
    if (!equalBytes(bytes, canonicalJsonBytes(value))) {
        throw new Error("Integration registry version manifest must use canonical JSON bytes");
    }
    const document = parseManifestDocument(value);
    const envelope = validateIntegrationPackageEnvelope(document.envelope, {
        limits,
        requireReleaseNotes: true,
    });
    if (envelope.kind !== options.expectedKind || envelope.version !== options.expectedVersion) {
        throw new Error("Integration registry version manifest identity does not match its catalog version");
    }
    const canonicalBytes = canonicalJsonBytes(envelope);
    const digest = await sha256Hex(canonicalBytes);
    if (document.digest !== digest) {
        throw new Error("Integration registry version manifest digest does not match its canonical envelope");
    }
    return {
        path: options.path,
        document: { ...document, envelope },
        envelope,
        canonicalBytes,
        digest,
    };
}

async function assertManifestWithinIntegrationRoot(integrationRoot: string, path: string): Promise<void> {
    const rootMetadata = await lstat(integrationRoot);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
        throw new Error("Integration root must be a non-symlink directory");
    }
    const root = await realpath(integrationRoot);
    const target = await realpath(path);
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error("Integration registry version manifest escapes its integration root");
    }
}

function parseManifestDocument(value: unknown): IntegrationRegistryVersionManifestV1 {
    if (!isRecord(value) || Object.keys(value).sort().join("\0") !== "digest\0envelope\0schema") {
        throw new Error("Integration registry version manifest must contain only schema, digest, and envelope");
    }
    if (value.schema !== INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA) {
        throw new Error(`Unsupported integration registry version manifest schema: ${String(value.schema)}`);
    }
    if (typeof value.digest !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest)) {
        throw new Error("Integration registry version manifest digest must be a lowercase SHA-256 hex value");
    }
    return {
        schema: INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA,
        digest: value.digest,
        envelope: value.envelope as IntegrationPackageEnvelopeV1,
    };
}

async function readStableFile(path: string, maxBytes: number): Promise<Uint8Array> {
    const pathMetadata = await lstat(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const metadata = await handle.stat();
        assertSameFile(pathMetadata, metadata, path);
        if (!metadata.isFile() || metadata.size > maxBytes) {
            throw new Error(`Integration registry version manifest exceeds ${maxBytes} bytes: ${path}`);
        }
        const bytes = new Uint8Array(maxBytes + 1);
        let offset = 0;
        while (offset < bytes.byteLength) {
            const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, null);
            if (bytesRead === 0) {
                break;
            }
            offset += bytesRead;
        }
        if (offset > maxBytes) {
            throw new Error(`Integration registry version manifest exceeds ${maxBytes} bytes: ${path}`);
        }
        assertSameFile(metadata, await handle.stat(), path);
        assertSameFile(metadata, await lstat(path), path);
        return bytes.subarray(0, offset);
    } finally {
        await handle.close();
    }
}

function assertSameFile(
    expected: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    actual: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    path: string,
): void {
    if (
        expected.dev !== actual.dev ||
        expected.ino !== actual.ino ||
        expected.size !== actual.size ||
        expected.mtimeMs !== actual.mtimeMs ||
        expected.ctimeMs !== actual.ctimeMs
    ) {
        throw new Error(`Integration registry version manifest changed while reading: ${path}`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
