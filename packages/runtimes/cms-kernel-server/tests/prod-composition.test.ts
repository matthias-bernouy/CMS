import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("constructs Kernel before listening", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountKernel.ts", import.meta.url)).text();
        const kernel = source.search(/new\s+runtime\.Kernel\s*\(/);
        const listen = source.search(/runner\.start\s*\(/);

        expect(kernel).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(kernel);
    });

    test("passes the configured host to the single listener", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountKernel.ts", import.meta.url)).text();

        expect(source).toMatch(/runner\.start\(\{\s*port:\s*env\.KERNEL_PORT,\s*hostname:\s*env\.KERNEL_HOST\s*\}\)/);
    });

    test("drains the HTTP kernel without owning persistent resources", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const shutdown = source.search(/const\s+shutdown\s*=/);
        const shutdownSource = source.slice(shutdown);
        const stop = shutdownSource.search(/await\s+kernel\.stop\s*\(\s*\)/);

        expect(shutdown).toBeGreaterThan(-1);
        expect(stop).toBeGreaterThan(-1);
        expect(source).not.toContain("createKernelStores");
        expect(source).not.toContain("MongoClient");
        expect(source).not.toContain("localUlviaProvider");
        expect(source).not.toContain("process.exit(0)");
    });
});
