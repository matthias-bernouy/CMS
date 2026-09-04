import { afterEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import type { LocalReleasePackage } from "../../src/release/types";
import { integrationDefinition, removeReadonlyTree } from "../fixtures";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

export async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-release-test-"));
    roots.push(root);
    return root;
}

export async function releasePackage(
    version: string,
    overrides: Record<string, unknown> = {},
    kind = "demo",
): Promise<LocalReleasePackage> {
    const parsed = parseIntegrationDefinition(integrationDefinition(kind, version, overrides));
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        files: { "definition.json": { encoding: "utf8", content: JSON.stringify(parsed) } },
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { package: { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) }, definition: parsed };
}

export const emptyRemote: typeof fetch = async () => Response.json({ error: "not found" }, { status: 404 });
