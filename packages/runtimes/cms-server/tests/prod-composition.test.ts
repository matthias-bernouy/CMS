import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("waits for Kernel readiness before listening", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountKernel.ts", import.meta.url)).text();
        const ready = source.search(/await\s+kernel\.ready/);
        const listen = source.slice(ready).search(/runner\.start\s*\(/);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(-1);
    });

    test("passes the configured host to the single listener", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountKernel.ts", import.meta.url)).text();

        expect(source).toMatch(/runner\.start\(\{\s*port:\s*env\.KERNEL_PORT,\s*hostname:\s*env\.KERNEL_HOST\s*\}\)/);
    });

    test("wires the encrypted secret store into gateway transport", async () => {
        const gateway = await Bun.file(
            new URL("../src/runtime/gateway/createProductionGateway.ts", import.meta.url),
        ).text();
        expect(gateway).toMatch(/const\s+resolveSecret\s*=\s*createSecretResolver\s*\(\s*secrets\s*\)\s*;/);
        expect(gateway).toMatch(/resolveToken:\s*async\s*\(reference\)/);
    });

    test("closes MongoDB only after the HTTP kernel has drained", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const shutdown = source.search(/const\s+shutdown\s*=/);
        const shutdownSource = source.slice(shutdown);
        const stop = shutdownSource.search(/await\s+kernel\.stop\s*\(\s*\)/);
        const stopCoreProvider = shutdownSource.search(/await\s+localCoreProvider\?\.stop\s*\(\s*\)/);
        const close = shutdownSource.search(/await\s+core\.close\s*\(\s*\)/);

        expect(shutdown).toBeGreaterThan(-1);
        expect(stop).toBeGreaterThan(-1);
        expect(stopCoreProvider).toBeGreaterThan(stop);
        expect(close).toBeGreaterThan(stopCoreProvider);
        expect(source).not.toContain("process.exit(0)");
    });
});
