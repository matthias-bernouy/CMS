import { describe, expect, test } from "bun:test";

describe("production CMS composition", () => {
    test("wires the encrypted secret store into Delivery gateway execution", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toContain("const resolveSecret     = createSecretResolver(secrets);");
        expect(source).toContain("sourceResolveSecret: resolveSecret,");
    });

    test("wires the durable functions repository into Control and Delivery", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(source).toContain("const functions         = new MongoFunctionRepository(db);");
        expect(source).toContain("dashboards,\n    functions,\n    publicAuth:");
        expect(source).toContain("sources, analytics,\n    functions,");
    });
});
