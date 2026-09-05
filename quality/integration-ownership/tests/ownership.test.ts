import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditIntegrationOwnership } from "../audit";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("integration ownership audit", () => {
    test("discovers business identities and follows exclusively owned test code", async () => {
        const root = await fixture({
            "packages/resources/official-integrations/package.json": packageManifest(
                "@bernouy/cms-official-integrations",
            ),
            "packages/resources/official-integrations/index.ts": "export const root = import.meta.dir;\n",
            "packages/resources/official-integrations/integrations/domains/consent/integration.json": JSON.stringify({
                kind: "consent",
            }),
            "packages/resources/official-integrations/integrations/domains/consent/trigger.json": JSON.stringify({
                type: "trigger",
                trigger: { id: "consent-stage-target" },
            }),
            "packages/resources/official-integrations/integrations/domains/consent/endpoints.json": JSON.stringify([
                { endpointId: "submitConsent" },
            ]),
            "packages/resources/official-integrations/integrations/collections/mossa/integration.json": JSON.stringify({
                kind: "mossa",
            }),
            "packages/resources/official-integrations/integrations/collections/mossa/bloc.json": JSON.stringify({
                type: "bloc",
                bloc: { tag: "mossa-consent-field" },
            }),
            "packages/resources/official-integrations/tests/dynamicCatalog.test.ts":
                "for (const item of catalog) await repository.get(item.kind);\n",
            "packages/resources/official-integrations/tests/concrete.test.ts":
                'await definitionRepository.get("consent");\n',
            "packages/resources/official-integrations/tests/short-repository-name.test.ts":
                'await repo.get("mossa");\n',
            "packages/surfaces/delivery/package.json": packageManifest("@fixture/delivery", {
                devDependencies: { "@bernouy/cms-official-integrations": "workspace:*" },
            }),
            "packages/surfaces/delivery/tests/consent.test.ts":
                'import { createConsentHarness } from "./support/consentHarness";\ncreateConsentHarness();\n',
            "packages/surfaces/delivery/tests/support/consentHarness.ts": [
                'import { ROOT } from "@bernouy/cms-official-integrations";',
                'import { backend } from "./consentBackend";',
                'import { generic } from "./generic";',
                'await definitionRepository.get("consent");',
                'expect(result).toEqual({ trigger: "consent-stage-target" });',
                'document.querySelector("mossa-consent-field");',
                "export const createConsentHarness = () => [ROOT, backend, generic];",
                "",
            ].join("\n"),
            "packages/surfaces/delivery/tests/support/consentBackend.ts": "export const backend = {};\n",
            "packages/surfaces/delivery/tests/support/generic.ts": "export const generic = {};\n",
            "packages/surfaces/delivery/tests/unrelated.test.ts":
                'import { generic } from "./support/generic";\nexpect(generic).toBeDefined();\n',
            "packages/features/domain/package.json": packageManifest("@fixture/domain"),
            "packages/features/domain/src/generic.ts":
                'export const record = { kind: "consent", endpoint: "submitConsent" };\n',
        });

        const { findings } = await auditIntegrationOwnership(root);
        expect(findings).toContainEqual(
            expect.objectContaining({ evidence: "official-package-dependency", confidence: "high" }),
        );
        expect(findings).toContainEqual(
            expect.objectContaining({
                file: expect.stringContaining("concrete.test.ts"),
                evidence: "integration-kind",
            }),
        );
        expect(findings).toContainEqual(
            expect.objectContaining({
                file: expect.stringContaining("short-repository-name.test.ts"),
                evidence: "integration-kind",
            }),
        );
        expect(findings).toContainEqual(
            expect.objectContaining({ file: expect.stringContaining("consentBackend.ts"), evidence: "owned-support" }),
        );
        expect(findings).toContainEqual(
            expect.objectContaining({ file: expect.stringContaining("consent.test.ts"), evidence: "owned-dependent" }),
        );
        expect(
            findings.some(({ file, evidence }) => file.endsWith("consentHarness.ts") && evidence === "owned-dependent"),
        ).toBe(false);
        expect(findings.some(({ file }) => file === "packages/features/domain/src/generic.ts")).toBe(false);
        expect(findings.some(({ file }) => file.endsWith("dynamicCatalog.test.ts"))).toBe(false);
        expect(
            findings.some(({ file, evidence }) => file.endsWith("support/generic.ts") && evidence === "owned-support"),
        ).toBe(false);
    });
});

async function fixture(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "integration-ownership-"));
    roots.push(root);
    for (const [path, contents] of Object.entries(files)) {
        const absolute = join(root, path);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, contents);
    }
    return root;
}

function packageManifest(name: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ name, ...extra });
}
