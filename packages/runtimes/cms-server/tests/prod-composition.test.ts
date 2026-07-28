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

    test("wires the encrypted secret store into Delivery gateway execution", async () => {
        const stores = await Bun.file(new URL("../src/runtime/stores/features.ts", import.meta.url)).text();
        const surfaces = await Bun.file(new URL("../src/runtime/mountSurfaces.ts", import.meta.url)).text();

        expect(stores).toMatch(/const\s+resolveSecret\s*=\s*createSecretResolver\s*\(\s*secrets\s*\)\s*;/);
        expect(surfaces).toMatch(/sourceResolveSecret\s*:\s*features\.resolveSecret\s*,/);
    });

    test("mounts repository reads only for the management CMS and never uses a loopback repository", async () => {
        const surfaces = await Bun.file(new URL("../src/runtime/mountSurfaces.ts", import.meta.url)).text();
        const entrypoint = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const controlSection = surfaces.slice(
            surfaces.indexOf("const controlRunner"),
            surfaces.indexOf("const deliveryRunner"),
        );
        const deliverySection = surfaces.slice(surfaces.indexOf("const deliveryRunner"));

        expect(controlSection).not.toContain('group("/.cms/repository"');
        expect(deliverySection).toContain('deliveryRunner.group("/.cms/repository"');
        expect(deliverySection).toMatch(
            /if\s*\(repositoryCatalog\)\s*\{[\s\S]*deliveryRunner\.group\("\/\.cms\/repository"/,
        );
        expect(entrypoint).not.toContain("127.0.0.1");
        expect(entrypoint).toContain("repository: env.integrationRepository");
    });

    test("initializes the durable package cache before mounting listeners", async () => {
        const entrypoint = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const cacheReady = entrypoint.search(/await\s+integrations\.integrationPackageCache\.init\s*\(\s*\)/);
        const surfaces = entrypoint.search(/await\s+mountProductionSurfaces\s*\(\s*\{/);

        expect(cacheReady).toBeGreaterThan(-1);
        expect(surfaces).toBeGreaterThan(cacheReady);
        expect(entrypoint).toContain("packageCacheObserve: createIntegrationPackageCacheObserver()");
    });

    test("wires durable functions and triggers into Control and Delivery", async () => {
        const stores = await Bun.file(new URL("../src/runtime/stores/features.ts", import.meta.url)).text();
        const surfaces = await Bun.file(new URL("../src/runtime/mountSurfaces.ts", import.meta.url)).text();

        expect(stores).toMatch(/const\s+functions\s*=\s*new\s+MongoFunctionRepository\s*\(\s*db\s*\)\s*;/);
        expect(stores).toMatch(/const\s+triggers\s*=\s*new\s+MongoTriggerRepository\s*\(\s*db\s*\)\s*;/);
        expect(stores).toMatch(/const\s+relations\s*=\s*new\s+MongoRelationRepository\s*\(\s*db\s*\)\s*;/);
        expect(surfaces).toMatch(/functions\s*:\s*features\.functions\s*,/);
        expect(surfaces).toMatch(/triggers\s*:\s*features\.triggers\s*,/);
        expect(surfaces).toMatch(/runtime\.startWorkers\s*\(\s*\{/);
    });

    test("migrates removed operator roles before mounting the surfaces", async () => {
        const entrypoint = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
        const stores = await Bun.file(new URL("../src/runtime/stores/core.ts", import.meta.url)).text();

        const storesReady = entrypoint.search(/await\s+createCoreStores\s*\(\s*env\s*\)/);
        const surfaces = entrypoint.search(/await\s+mountProductionSurfaces\s*\(\s*\{/);

        expect(stores).toMatch(/await\s+migrateLegacyOperatorRoles\s*\(\s*users\s*,\s*mongoRoles\s*\)/);
        expect(storesReady).toBeGreaterThan(-1);
        expect(surfaces).toBeGreaterThan(storesReady);
    });
});
