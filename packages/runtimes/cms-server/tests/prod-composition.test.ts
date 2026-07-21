import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("waits for Control readiness before listening", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const ready = source.indexOf("await controlCms.ready");
        const listen = source.indexOf("controlRunner.start", ready);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(ready);
    });

    test.failing("passes configured hosts to both listeners", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toMatch(/controlRunner\.start\(\{\s*port:\s*CONTROL_PORT,\s*hostname:\s*CONTROL_HOST\s*\}\)/);
        expect(source).toMatch(/deliveryRunner\.start\(\{\s*port:\s*DELIVERY_PORT,\s*hostname:\s*DELIVERY_HOST\s*\}\)/);
    });

    test("wires the encrypted secret store into Delivery gateway execution", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toContain("const resolveSecret     = createSecretResolver(secrets);");
        expect(source).toContain("sourceResolveSecret: resolveSecret,");
    });

    test("wires durable functions and triggers into Control and Delivery", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toContain("const functions         = new MongoFunctionRepository(db);");
        expect(source).toContain("const triggers          = new MongoTriggerRepository(db);");
        expect(source).toContain("const relations         = new MongoRelationRepository(db);");
        expect(source).toContain("dashboards,\n    relations,\n    functions,\n    triggers,\n    identities,\n    sourceOverlays,");
        expect(source).toContain("sources: deliverySources, analytics,\n    functions,\n    triggers,\n    identities,");
        expect(source).toContain("startProductionSystemFunctionWorkers({");
    });

    test("migrates removed operator roles before mounting the surfaces", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        const migration = source.indexOf("await migrateLegacyOperatorRoles(users, mongoRoles)");
        const control = source.indexOf("const controlCms = new ControlCms");
        const delivery = source.indexOf("new DeliveryCms({");

        expect(migration).toBeGreaterThan(-1);
        expect(migration).toBeLessThan(control);
        expect(migration).toBeLessThan(delivery);
    });
});
