import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { validateIntegrationVerificationEnvelope } from "@bernouy/cms-integration-verification";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { verificationBundleRelativePath } from "../../../src/repositoryPublication/candidate/verification";

const temporaryRoots: string[] = [];

export type VerificationOptions = Readonly<{
    conformance?: readonly Readonly<{ suiteId: string; entrypoint: string }>[];
    files?: Readonly<Record<string, Readonly<{ encoding: "utf8"; content: string }>>>;
    packageDigest?: string;
    runnerRequirements?: readonly Readonly<{ name: string; versionRange: string }>[];
    source?: string;
}>;

export async function cleanupTemporaryRoots(): Promise<void> {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function integrationRoot(versions: readonly string[]): Promise<string> {
    const parent = await temporaryRoot();
    const root = join(parent, "demo");
    await writeIntegration(root, "demo", versions);
    return root;
}

export async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-cli-candidate-builder-"));
    temporaryRoots.push(root);
    return root;
}

export async function writeIntegration(root: string, kind: string, versions: readonly string[]): Promise<void> {
    await writeJson(join(root, "integration.json"), {
        schema: "cms.integration.index.v1",
        kind,
        label: `Integration ${kind}`,
        versions: versions.map((version) => ({
            version,
            path: `versions/${version}`,
            definition: `versions/${version}/definition.json`,
        })),
    });
    await Promise.all(
        versions.map(async (version) => {
            const versionRoot = join(root, "versions", version);
            await writeJson(join(versionRoot, "definition.json"), {
                kind,
                label: `Integration ${kind}`,
                version,
                inputs: [],
            });
            await writeText(join(versionRoot, "README.md"), `# ${kind} ${version}\n`);
            await writeText(join(versionRoot, "connectors/supabase/sql/schema.sql"), `select '${version}';\n`);
            await writeBytes(join(versionRoot, "assets/payload.bin"), Uint8Array.of(0xff, 0));
        }),
    );
    for (const version of versions) {
        await writeVerification(root, kind, version);
    }
}

export async function writeVerification(
    root: string,
    kind: string,
    version: string,
    options: VerificationOptions = {},
): Promise<string> {
    const packageDigest = await integrationPackageDigest(root, kind, version);
    const source =
        options.source ??
        'import { defineSuite, test } from "@bernouy/cms-integration-verification/sdk/v1";\n' +
            'export default defineSuite({ tests: [test("implementation", async ({ query }) => { await query("select 1"); })] });\n';
    const envelope = validateIntegrationVerificationEnvelope({
        schema: "cms.integration.verification.v1",
        target: { kind, version, packageDigest: options.packageDigest ?? packageDigest },
        manifest: {
            runnerRequirements: options.runnerRequirements ?? [{ name: "cms-postgres", versionRange: "^1.0.0" }],
            contracts: [],
            conformance: options.conformance ?? [{ suiteId: "implementation", entrypoint: "suites/implementation.ts" }],
            fixtures: [],
        },
        files:
            options.files ??
            ({
                "suites/implementation.ts": { encoding: "utf8", content: source },
            } as const),
    });
    await writeBytes(join(root, verificationBundleRelativePath(version)), canonicalJsonBytes(envelope));
    return packageDigest;
}

export async function writeText(path: string, value: string): Promise<void> {
    await writeBytes(path, new TextEncoder().encode(value));
}

async function integrationPackageDigest(root: string, kind: string, version: string): Promise<string> {
    const repository = new FsIntegrationDefinitionRepository(root);
    const location = await repository.locateExactVersion(kind, version);
    if (!location?.releaseNotes) {
        throw new Error("Test integration package location is incomplete");
    }
    return (
        await readIntegrationPackageDirectory({
            root: location.root,
            kind,
            version,
            definition: location.definition,
            releaseNotes: location.releaseNotes,
        })
    ).digest;
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await writeText(path, JSON.stringify(value));
}

async function writeBytes(path: string, value: Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
}
