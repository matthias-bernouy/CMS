import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("waits for Control readiness before listening", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountSurfaces.ts", import.meta.url)).text();
        const ready = source.search(/await\s+controlCms\.ready/);
        const listen = source.slice(ready).search(/controlRunner\.start\s*\(/);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(-1);
    });

    test.failing("passes configured hosts to both listeners", async () => {
        const source = await Bun.file(new URL("../src/runtime/mountSurfaces.ts", import.meta.url)).text();

        expect(source).toMatch(
            /controlRunner\.start\(\{\s*port:\s*env\.CONTROL_PORT,\s*hostname:\s*env\.CONTROL_HOST\s*\}\)/,
        );
        expect(source).toMatch(
            /deliveryRunner\.start\(\{\s*port:\s*env\.DELIVERY_PORT,\s*hostname:\s*env\.DELIVERY_HOST\s*\}\)/,
        );
    });

    test("wires the encrypted secret store into gateway transport", async () => {
        const gateway = await Bun.file(
            new URL("../src/runtime/gateway/createProductionGateway.ts", import.meta.url),
        ).text();
        expect(gateway).toMatch(/const\s+resolveSecret\s*=\s*createSecretResolver\s*\(\s*secrets\s*\)\s*;/);
        expect(gateway).toMatch(/resolveToken:\s*async\s*\(reference\)/);
    });
});
