import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectMissingGeneratedIntegrationArtifacts } from "cms-cli/dev-server/integrations";

async function makeSite(): Promise<string> {
    return await mkdtemp(join(tmpdir(), "p9r-dev-integrations-"));
}

describe("detectMissingGeneratedIntegrationArtifacts", () => {
    test("returns null when no local integration imports exist", async () => {
        expect(await detectMissingGeneratedIntegrationArtifacts(await makeSite())).toBeNull();
    });

    test("detects local integration imports without generated installations", async () => {
        const siteDir = await makeSite();
        mkdirSync(join(siteDir, "integrations"));
        writeFileSync(join(siteDir, "integrations", "demo.json"), "{}\n");

        expect(await detectMissingGeneratedIntegrationArtifacts(siteDir)).toEqual({
            imports: ["integrations/demo.json"],
            generatedInstallationsFile: join(siteDir, ".p9r", "generated", "integration-installations.json"),
        });
    });

    test("returns null when generated installations exist", async () => {
        const siteDir = await makeSite();
        mkdirSync(join(siteDir, "integrations"));
        mkdirSync(join(siteDir, ".p9r", "generated"), { recursive: true });
        writeFileSync(join(siteDir, "integrations", "demo.json"), "{}\n");
        writeFileSync(join(siteDir, ".p9r", "generated", "integration-installations.json"), "[]\n");

        expect(await detectMissingGeneratedIntegrationArtifacts(siteDir)).toBeNull();
    });
});
