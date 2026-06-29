import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    LocalFsGeneratedSourceRepository,
    loadGeneratedSources,
} from "cms-cli/dev-server/integrations";
import type { Source } from "@bernouy/cms-sources";

const source = (id: string, targetUrl = "https://api.example.com/x"): Source => ({
    urn: `urn:${id}`,
    meta: { name: id },
    endpoints: [{ urn: `urn:${id}:list`, method: "GET", targetUrl }],
});

describe("LocalFsGeneratedSourceRepository", () => {
    test("createSource writes a generated source artifact", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-generated-source-"));
        const repo = new LocalFsGeneratedSourceRepository(siteDir);

        await repo.createSource(source("shop"));

        const file = join(siteDir, ".p9r", "generated", "sources", "shop.json");
        const stored = JSON.parse(await readFile(file, "utf-8")) as Source;
        expect(stored.urn).toBe("urn:shop");
        expect(await loadGeneratedSources(siteDir)).toHaveLength(1);
    });

    test("updateSource rewrites the generated artifact", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-generated-source-"));
        const repo = new LocalFsGeneratedSourceRepository(siteDir);
        await repo.createSource(source("shop"));

        await repo.updateSource(source("shop", "https://api.example.com/y"));

        const file = join(siteDir, ".p9r", "generated", "sources", "shop.json");
        const stored = JSON.parse(await readFile(file, "utf-8")) as Source;
        expect(stored.endpoints[0]!.targetUrl).toBe("https://api.example.com/y");
    });

    test("deleteSource removes the generated artifact", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-generated-source-"));
        const repo = new LocalFsGeneratedSourceRepository(siteDir);
        await repo.createSource(source("shop"));

        expect(await repo.deleteSource("urn:shop")).toBe(true);

        expect(existsSync(join(siteDir, ".p9r", "generated", "sources", "shop.json"))).toBe(false);
        expect(await repo.getSource("urn:shop")).toBeNull();
    });
});
