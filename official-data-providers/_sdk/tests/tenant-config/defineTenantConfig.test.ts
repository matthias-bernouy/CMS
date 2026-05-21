import { test, expect } from "bun:test";
import { z } from "zod";
import { defineTenantConfig } from "src/core/tenantConfig/defineTenantConfig";
import { ConfigError } from "src/core/errors";

test("emits a valid TenantConfigSchema with version + properties", () => {
    const Schema = z.object({
        maxNotes:   z.number().int().min(1).max(100).default(10),
        allowEmoji: z.boolean().default(true),
    });
    const cfg = defineTenantConfig({
        version: "1.0",
        zod: Schema,
        title: "demo",
        defaultWritableBy: ["control-plane", "tenant"],
        annotations: {
            maxNotes:   { title: "Max", widget: "slider", group: "Limits" },
            allowEmoji: { title: "Emoji",     widget: "toggle" },
        },
    });

    expect(cfg.version).toBe("1.0");
    expect(cfg.schema["title"]).toBe("demo");
    expect(cfg.schema["defaultWritableBy"]).toEqual(["control-plane", "tenant"]);

    const props = cfg.schema["properties"] as Record<string, Record<string, unknown>>;
    expect(props["maxNotes"]?.["title"]).toBe("Max");
    expect(props["maxNotes"]?.["x-widget"]).toBe("slider");
    expect(props["maxNotes"]?.["x-group"]).toBe("Limits");
    expect(props["allowEmoji"]?.["x-widget"]).toBe("toggle");
});

test("attaches writeOnly + x-writable-by + x-visible-if", () => {
    const Schema = z.object({
        mode:        z.string(),
        contractRef: z.string().optional(),
    });
    const cfg = defineTenantConfig({
        version: "1.0",
        zod: Schema,
        annotations: {
            contractRef: {
                writeOnly:  true,
                writableBy: ["control-plane"],
                visibleIf:  { mode: "advanced" },
            },
        },
    });
    const props = cfg.schema["properties"] as Record<string, Record<string, unknown>>;
    expect(props["contractRef"]?.["writeOnly"]).toBe(true);
    expect(props["contractRef"]?.["x-writable-by"]).toEqual(["control-plane"]);
    expect(props["contractRef"]?.["x-visible-if"]).toEqual({ mode: "advanced" });
});

test("exposes zod + partial for hook / PATCH validation", async () => {
    const Schema = z.object({
        maxNotes:   z.number().int().min(1).max(100),
        allowEmoji: z.boolean(),
    });
    const cfg = defineTenantConfig({ version: "1.0", zod: Schema });

    // .zod parses full shape
    expect(cfg.zod.parse({ maxNotes: 5, allowEmoji: true })).toEqual({ maxNotes: 5, allowEmoji: true });
    // .partial accepts subset
    expect(cfg.partial.parse({ maxNotes: 3 })).toEqual({ maxNotes: 3 });
    // .zod rejects subset (all required)
    expect(() => cfg.zod.parse({ maxNotes: 3 })).toThrow();
});

test("typo'd annotation key → ConfigError (fail fast)", () => {
    const Schema = z.object({ maxNotes: z.number() });
    expect(() => defineTenantConfig({
        version: "1.0", zod: Schema,
        annotations: { maxNote: { title: "oops typo" } },          // missing s
    })).toThrow(ConfigError);
});

test("result is shape-compatible with TenantConfigSchema (createProvider acceptable)", () => {
    const Schema = z.object({ a: z.string() });
    const cfg = defineTenantConfig({ version: "1.0", zod: Schema });
    // Use as TenantConfigSchema: only version + schema are required, both present.
    const tc: { version: string; schema: Record<string, unknown> } = cfg;
    expect(typeof tc.version).toBe("string");
    expect(typeof tc.schema).toBe("object");
});
