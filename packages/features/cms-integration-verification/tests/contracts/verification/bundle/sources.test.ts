import { describe, expect, test } from "bun:test";
import {
    INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER,
    INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA,
    buildIntegrationVerificationSuiteContent,
    computeIntegrationVerificationDigest,
    computeIntegrationVerificationSuiteContentDigest,
    validateIntegrationVerificationEnvelope,
    validateIntegrationVerificationSuiteSources,
} from "../../../../src/exports/index";
import { verificationEnvelope } from "../../fixtures";

describe("verification author suite sources", () => {
    test("accepts a closed graph of exact local imports and re-exports", async () => {
        const envelope = await sourceEnvelope();

        await expect(validateIntegrationVerificationSuiteSources(envelope)).resolves.toEqual(envelope);
        await expect(computeIntegrationVerificationDigest(envelope)).resolves.toHaveLength(64);
    });

    test("keeps the parser available as a production dependency", async () => {
        const manifest = await Bun.file(new URL("../../../../package.json", import.meta.url)).json();

        expect(manifest.dependencies.typescript).toBe("^5.9.3");
        await expect(import("typescript")).resolves.toHaveProperty("createSourceFile");
    });

    test("rejects package, network, escaping, inferred, and dynamic resolution", async () => {
        const hostileSources = [
            'import "node:fs";',
            'import "@vendor/package";',
            'import "@bernouy/cms-integration-verification/sdk/v2";',
            'import "https://example.invalid/module.ts";',
            'import "../../../secret.ts";',
            'import "./%2e%2e/secret.ts";',
            'import "./support/helper";',
            'import "../fixtures/data.bin";',
            'const target = "./support/helper.ts"; void import(target);',
            'const resolver = require.resolve; void resolver("@vendor/package");',
            'void Bun.resolveSync("@vendor/package", import.meta.dir);',
            'void fetch("https://example.invalid");',
            "void process.env;",
            "void import.meta.env;",
            "void globalThis.crypto;",
            'export default ({})["constructor"];',
            'export default Reflect.get(() => undefined, "constructor");',
            'const key = "con" + "structor"; export default (() => undefined)[key];',
            "const { constructor: escape } = () => undefined; export default escape;",
            '/// <reference types="bun" />\nexport default true;',
            "export default import.meta.url;",
            'import { broken from "./support/helper.ts";',
        ];
        for (const content of hostileSources) {
            const envelope = await sourceEnvelope(content);
            await expect(validateIntegrationVerificationSuiteSources(envelope)).rejects.toThrow(/verification source/);
        }
    });

    test("binds the full transitive source closure but ignores unrelated files", async () => {
        const envelope = await sourceEnvelope();
        const content = await buildIntegrationVerificationSuiteContent(envelope, "contract", "public-contract");
        const digest = await contractDigest(envelope);
        const reordered = { ...envelope, files: Object.fromEntries(Object.entries(envelope.files).reverse()) };
        const changedHelper = replaceFile(envelope, "shared/value.ts", "export const value = 2;");
        const changedUnrelated = replaceFile(envelope, "notes/unrelated.ts", "export const note = 2;");
        const changedFixture = replaceFile(envelope, "fixtures/data.bin", "AgM=");

        expect(content.schema).toBe(INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA);
        expect(content.sources.map((source) => source.path)).toEqual([
            "shared/value.ts",
            "tests/contract.ts",
            "tests/lazy.ts",
            "tests/support/helper.ts",
        ]);
        await expect(contractDigest(reordered)).resolves.toBe(digest);
        await expect(contractDigest(changedHelper)).resolves.not.toBe(digest);
        await expect(contractDigest(changedUnrelated)).resolves.toBe(digest);
        await expect(contractDigest(changedFixture)).resolves.not.toBe(digest);
    });

    test("requires contracts to remain active through the end of the target major", async () => {
        const envelope = await verificationEnvelope();
        for (const activeMajorRange of ["1.2.0", "~1.2.0", ">=1.2.0 <1.4.0", ">=1.2.0 <3.0.0"]) {
            expect(() =>
                validateIntegrationVerificationEnvelope({
                    ...envelope,
                    manifest: {
                        ...envelope.manifest,
                        contracts: [{ ...envelope.manifest.contracts[0]!, activeMajorRange }],
                    },
                }),
            ).toThrow(/through the end of the 1\.x major/);
        }
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    contracts: [{ ...envelope.manifest.contracts[0]!, activeMajorRange: ">=1.2.0 <2.0.0" }],
                },
            }),
        ).not.toThrow();

        const zeroMajor = {
            ...envelope,
            target: { ...envelope.target, version: "0.2.0" },
            manifest: {
                ...envelope.manifest,
                contracts: [{ ...envelope.manifest.contracts[0]!, activeMajorRange: "^0.2.0" }],
            },
        };
        expect(() => validateIntegrationVerificationEnvelope(zeroMajor)).toThrow(/end of the 0\.x major/);
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...zeroMajor,
                manifest: {
                    ...zeroMajor.manifest,
                    contracts: [{ ...zeroMajor.manifest.contracts[0]!, activeMajorRange: ">=0.2.0 <1.0.0" }],
                },
            }),
        ).not.toThrow();
    });
});

async function sourceEnvelope(contractSource?: string) {
    const envelope = await verificationEnvelope();
    return {
        ...envelope,
        files: {
            ...envelope.files,
            "tests/contract.ts": {
                encoding: "utf8" as const,
                content:
                    contractSource ??
                    `import { defineSuite } from ${JSON.stringify(INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER)}; export { helper } from "./support/helper.ts"; export const lazy = () => import("./lazy.ts"); export default defineSuite({ tests: [] });`,
            },
            "tests/support/helper.ts": {
                encoding: "utf8" as const,
                content: 'export { value as helper } from "../../shared/value.ts";',
            },
            "tests/lazy.ts": { encoding: "utf8" as const, content: "export default true;" },
            "shared/value.ts": { encoding: "utf8" as const, content: "export const value = 1;" },
            "notes/unrelated.ts": { encoding: "utf8" as const, content: "export const note = 1;" },
        },
    };
}

async function contractDigest(envelope: unknown): Promise<string> {
    return await computeIntegrationVerificationSuiteContentDigest(envelope, "contract", "public-contract");
}

function replaceFile<T extends { files: Record<string, unknown> }>(envelope: T, path: string, content: string): T {
    return {
        ...envelope,
        files: { ...envelope.files, [path]: { encoding: "utf8", content } },
    };
}
