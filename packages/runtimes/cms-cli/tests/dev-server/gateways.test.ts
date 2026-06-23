import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsGatewayRepository, loadDevGateways } from "cms-cli/dev-server/gateways";
import type { Provider } from "@bernouy/cms-gateway";

const provider = (id: string, targetUrl = "https://api.example.com/x"): Provider => ({
    urn: `urn:${id}`,
    meta: { name: id },
    endpoints: [{ urn: `urn:${id}:list`, method: "GET", targetUrl }],
});

describe("LocalFsGatewayRepository", () => {
    test("createProvider writes a gateway manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsGatewayRepository(siteDir);

        await repo.createProvider(provider("shop"));

        const file = join(siteDir, "gateways", "shop.json");
        const stored = JSON.parse(await readFile(file, "utf-8")) as Provider;
        expect(stored.urn).toBe("urn:shop");
        expect(await loadDevGateways(siteDir)).toHaveLength(1);
    });

    test("updateProvider rewrites the manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsGatewayRepository(siteDir);
        await repo.createProvider(provider("shop"));

        await repo.updateProvider(provider("shop", "https://api.example.com/y"));

        const stored = JSON.parse(await readFile(join(siteDir, "gateways", "shop.json"), "utf-8")) as Provider;
        expect(stored.endpoints[0]!.targetUrl).toBe("https://api.example.com/y");
    });

    test("deleteProvider removes the manifest", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-gateway-"));
        const repo = new LocalFsGatewayRepository(siteDir);
        await repo.createProvider(provider("shop"));

        expect(await repo.deleteProvider("urn:shop")).toBe(true);

        expect(existsSync(join(siteDir, "gateways", "shop.json"))).toBe(false);
        expect(await repo.getProvider("urn:shop")).toBeNull();
    });
});
