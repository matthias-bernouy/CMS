import { canonicalJsonBytes, decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { collectVerificationSuiteSourceClosure } from "../core/validation/suiteSources";
import {
    INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER,
    INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER,
    type IntegrationVerificationEnvelopeV1,
} from "../interfaces/verification";
import { defineUpgradeScenarios, type UpgradeFixtureSuiteV1 } from "../sdk/upgrade-fixtures-v1";

const MAX_BUNDLE_BYTES = 24 * 1_048_576;
const PORTABLE_SDKS = [
    INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER,
    INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER,
] as const;

export async function loadUpgradeFixtureSuiteModule(path: string): Promise<UpgradeFixtureSuiteV1> {
    const loaded = await importFixtureModule(path);
    return defineUpgradeScenarios(loaded.default as UpgradeFixtureSuiteV1);
}

export async function loadUpgradeFixtureSuiteFromVerification(
    verification: IntegrationVerificationEnvelopeV1,
): Promise<UpgradeFixtureSuiteV1 | null> {
    const declaration = verification.manifest.upgradeFixture;
    if (!declaration) {
        return null;
    }
    const root = await mkdtemp(join(tmpdir(), "ulvia-upgrade-source-"));
    try {
        const closure = await collectVerificationSuiteSourceClosure(verification.files, declaration.entrypoint);
        for (const { path, file } of closure) {
            const destination = join(root, ...path.split("/"));
            await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
            await writeFile(destination, decodeIntegrationPackageFile(file), { flag: "wx", mode: 0o600 });
        }
        const suite = await loadUpgradeFixtureSuiteModule(join(root, declaration.entrypoint));
        assertExactMetadata(suite, declaration.scenarios);
        return suite;
    } catch (error) {
        const message = error instanceof Error && error.message ? error.message : String(error);
        const detail = message ? `: ${message.slice(0, 512)}` : "";
        throw new Error(`Invalid bundled upgrade fixture${detail}`, { cause: error });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function importFixtureModule(path: string): Promise<Readonly<{ default?: unknown }>> {
    const resolvedSdks = new Map<string, string>(
        PORTABLE_SDKS.map((specifier) => [specifier, Bun.resolveSync(specifier, import.meta.dir)]),
    );
    const output = await Bun.build({
        entrypoints: [path],
        target: "bun",
        format: "esm",
        splitting: false,
        minify: false,
        sourcemap: "none",
        plugins: [
            {
                name: "ulvia-portable-verification-sdks",
                setup(build) {
                    build.onResolve(
                        { filter: /^@bernouy\/cms-integration-verification\/(?:sdk|upgrade-fixtures)\/v1$/u },
                        ({ path }) => ({ path: resolvedSdks.get(path)!, external: true }),
                    );
                },
            },
        ],
    });
    if (!output.success || output.outputs.length !== 1) {
        throw new Error("Upgrade fixture module could not be bundled");
    }
    let source = await output.outputs[0]!.text();
    for (const [specifier, resolved] of resolvedSdks) {
        source = source.replaceAll(specifier, pathToFileURL(resolved).href);
    }
    if (Buffer.byteLength(source) > MAX_BUNDLE_BYTES) {
        throw new Error("Upgrade fixture module exceeds its bundle limit");
    }
    const root = await mkdtemp(join(tmpdir(), "ulvia-upgrade-fixture-"));
    const bundle = join(root, "bundle.mjs");
    try {
        await writeFile(bundle, source, { flag: "wx", mode: 0o600 });
        return (await import(pathToFileURL(bundle).href)) as Readonly<{ default?: unknown }>;
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

function assertExactMetadata(
    suite: UpgradeFixtureSuiteV1,
    expected: NonNullable<IntegrationVerificationEnvelopeV1["manifest"]["upgradeFixture"]>["scenarios"],
): void {
    const actual = suite.scenarios
        .map(({ name, from, dependencies }) => ({
            name,
            from,
            ...(dependencies
                ? { dependencies: [...dependencies].toSorted((left, right) => left.kind.localeCompare(right.kind)) }
                : {}),
        }))
        .toSorted((left, right) => left.name.localeCompare(right.name));
    if (!sameBytes(canonicalJsonBytes(actual), canonicalJsonBytes(expected))) {
        throw new Error("Upgrade fixture runtime export does not match its digest-bound manifest metadata");
    }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
