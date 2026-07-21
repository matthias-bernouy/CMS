import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsIntegrationConnectorProviderRepository } from "cms-cli/dev-server/connectorProviders";

describe("LocalFsIntegrationConnectorProviderRepository", () => {
    test("persists non-secret provider settings with an atomic file replacement", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-connector-providers-"));
        const first = new LocalFsIntegrationConnectorProviderRepository(siteDir);
        const input = {
            provider: "supabase" as const,
            enabled: true,
            projectRef: "courtside",
        };

        const saved = await first.upsert(input);
        input.projectRef = "mutated-after-save";
        saved.projectRef = "mutated-return-value";

        const second = new LocalFsIntegrationConnectorProviderRepository(siteDir);
        expect(await second.get("supabase")).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "courtside",
        });

        const settingsDir = join(siteDir, ".p9r");
        const source = await readFile(join(settingsDir, "connector-providers.json"), "utf-8");
        expect(source).toContain('"projectRef": "courtside"');
        expect(source).not.toContain("accessToken");
        expect((await readdir(settingsDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("returns null before a provider is configured", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-connector-providers-"));
        const repository = new LocalFsIntegrationConnectorProviderRepository(siteDir);

        expect(await repository.get("supabase")).toBeNull();
    });
});
