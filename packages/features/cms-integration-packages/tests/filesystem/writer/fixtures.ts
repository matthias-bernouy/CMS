import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    validateIntegrationPackageEnvelope,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageLimits,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { cleanupRoots } from "../cache/fixtures";

export const cleanup: string[] = [];

export async function cleanupWriterRoots(): Promise<void> {
    await cleanupRoots(cleanup);
}

export async function temporaryWriterParent(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integration-writer-"));
    cleanup.push(root);
    return root;
}

export async function packageInput(
    overrides: Partial<IntegrationPackageEnvelopeV1> = {},
    limits?: Partial<IntegrationPackageLimits>,
): Promise<ResolvedIntegrationPackage> {
    const envelope = validateIntegrationPackageEnvelope(
        {
            schema: "cms.integration.package.v1",
            kind: "writer-demo",
            version: "1.2.3",
            definition: "definition.json",
            releaseNotes: "release-notes.md",
            files: {
                "definition.json": {
                    encoding: "utf8",
                    content: '{"kind":"writer-demo","version":"1.2.3","label":"Crème"}',
                },
                "release-notes.md": { encoding: "utf8", content: "# Release\n\nExact UTF-8: été.\n" },
                "assets/icon.svg": { encoding: "utf8", content: "<svg/>" },
            },
            ...overrides,
        },
        { limits },
    );
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export function writerOptions(parent: string, input: ResolvedIntegrationPackage) {
    return {
        destination: join(parent, "candidate"),
        expected: {
            kind: input.envelope.kind,
            version: input.envelope.version,
            digest: input.digest,
        },
    } as const;
}

export async function existingDirectory(parent: string, name: string): Promise<string> {
    const path = join(parent, name);
    await mkdir(path);
    return path;
}
