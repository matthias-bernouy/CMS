import { test, expect } from "bun:test";
import { buildTenantConfigSpec } from "src/core/tenantConfig/buildTenantConfigSpec";

test("attaches $schema URI and version, splats the inner schema", () => {
    const out = buildTenantConfigSpec({
        version: "1.0",
        schema: {
            type: "object",
            title: "demo",
            properties: { a: { type: "string" } },
            required: ["a"],
        },
    });
    expect(out["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(out["version"]).toBe("1.0");
    expect(out["type"]).toBe("object");
    expect(out["title"]).toBe("demo");
    expect(out["properties"]).toEqual({ a: { type: "string" } });
    expect(out["required"]).toEqual(["a"]);
});

test("inner schema can override version (last write wins is fine — provider's call)", () => {
    // version field appears BEFORE the splat in build → if the inner schema
    // also has `version`, the inner wins. Acceptable: lets a provider pin a
    // custom version line if desired.
    const out = buildTenantConfigSpec({
        version: "1.0",
        schema: { version: "2.0", type: "object" },
    });
    expect(out["version"]).toBe("2.0");
});
