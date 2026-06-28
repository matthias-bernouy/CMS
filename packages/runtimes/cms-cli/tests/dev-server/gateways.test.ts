import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsSourceRepository, loadDevGateways } from "cms-cli/dev-server/gateways";
import type { Source } from "@bernouy/cms-sources";

const provider = (id: string, targetUrl = "https://api.example.com/x"): Source => ({
    urn: `urn:${id}`,
    meta: { name: id },
    endpoints: [{ urn: `urn:${id}:list`, method: "GET", targetUrl }],
});

describe("LocalFsSourceRepository", () => {
    test("createSource writes a gateway manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsSourceRepository(siteDir);

        await repo.createSource(provider("shop"));

        const file = join(siteDir, "gateways", "shop.json");
        const stored = JSON.parse(await readFile(file, "utf-8")) as Source;
        expect(stored.urn).toBe("urn:shop");
        expect(await loadDevGateways(siteDir)).toHaveLength(1);
    });

    test("updateSource rewrites the manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsSourceRepository(siteDir);
        await repo.createSource(provider("shop"));

        await repo.updateSource(provider("shop", "https://api.example.com/y"));

        const stored = JSON.parse(await readFile(join(siteDir, "gateways", "shop.json"), "utf-8")) as Source;
        expect(stored.endpoints[0]!.targetUrl).toBe("https://api.example.com/y");
    });

    test("deleteSource removes the manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsSourceRepository(siteDir);
        await repo.createSource(provider("shop"));

        expect(await repo.deleteSource("urn:shop")).toBe(true);

        expect(existsSync(join(siteDir, "gateways", "shop.json"))).toBe(false);
        expect(await repo.getSource("urn:shop")).toBeNull();
    });
});
