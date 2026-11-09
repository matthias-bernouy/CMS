import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("constructs the shared Edge host before listening", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const edge = source.search(/new\s+SharedEdge\s*\(/);
        const listen = source.search(/runner\.start\s*\(/);

        expect(edge).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(edge);
    });

    test("passes the configured host to the single listener", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toMatch(/runner\.start\(\{\s*port:\s*env\.CMS_PORT,\s*hostname:\s*env\.CMS_HOST\s*\}\)/);
    });

    test("drains the HTTP edge without owning persistent resources", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const shutdown = source.search(/const\s+shutdown\s*=/);
        const shutdownSource = source.slice(shutdown);
        const stop = shutdownSource.search(/await\s+runner\.stopGracefully\s*\(\s*\)/);

        expect(shutdown).toBeGreaterThan(-1);
        expect(stop).toBeGreaterThan(-1);
        expect(shutdownSource.search(/await\s+edge\.close\s*\(\s*\)/)).toBeGreaterThan(stop);
        expect(source).not.toContain("createEdgeStores");
        expect(source).not.toContain("MongoClient");
        expect(source).not.toContain("localUlviaProvider");
        expect(source).not.toContain("process.exit(0)");
    });
});
