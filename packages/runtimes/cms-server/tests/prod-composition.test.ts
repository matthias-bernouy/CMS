import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("waits for Control readiness before listening", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const ready = source.search(/await\s+controlCms\.ready/);
        const listen = source.slice(ready).search(/controlRunner\.start\s*\(/);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(-1);
    });

    test.failing("passes configured hosts to both listeners", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toMatch(/controlRunner\.start\(\{\s*port:\s*CONTROL_PORT,\s*hostname:\s*CONTROL_HOST\s*\}\)/);
        expect(source).toMatch(/deliveryRunner\.start\(\{\s*port:\s*DELIVERY_PORT,\s*hostname:\s*DELIVERY_HOST\s*\}\)/);
    });

    test("wires the encrypted secret store into Delivery gateway execution", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toMatch(/const\s+resolveSecret\s*=\s*createSecretResolver\s*\(\s*secrets\s*\)\s*;/);
        expect(source).toMatch(/sourceResolveSecret\s*:\s*resolveSecret\s*,/);
    });

    test("wires durable functions and triggers into Control and Delivery", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toMatch(/const\s+functions\s*=\s*new\s+MongoFunctionRepository\s*\(\s*db\s*\)\s*;/);
        expect(source).toMatch(/const\s+triggers\s*=\s*new\s+MongoTriggerRepository\s*\(\s*db\s*\)\s*;/);
        expect(source).toMatch(/const\s+relations\s*=\s*new\s+MongoRelationRepository\s*\(\s*db\s*\)\s*;/);
        expect(source).toMatch(
            /dashboards\s*,\s*relations\s*,\s*functions\s*,\s*triggers\s*,\s*identities\s*,\s*sourceOverlays\s*,/,
        );
        expect(source).toMatch(
            /sources\s*:\s*deliverySources\s*,\s*analytics\s*,\s*functions\s*,\s*triggers\s*,\s*identities\s*,/,
        );
        expect(source).toMatch(/startProductionSystemFunctionWorkers\s*\(\s*\{/);
    });

    test("migrates removed operator roles before mounting the surfaces", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        const migration = source.search(/await\s+migrateLegacyOperatorRoles\s*\(\s*users\s*,\s*mongoRoles\s*\)/);
        const control = source.search(/const\s+controlCms\s*=\s*new\s+ControlCms\s*\(/);
        const delivery = source.search(/new\s+DeliveryCms\s*\(\s*\{/);

        expect(migration).toBeGreaterThan(-1);
        expect(migration).toBeLessThan(control);
        expect(migration).toBeLessThan(delivery);
    });
});
