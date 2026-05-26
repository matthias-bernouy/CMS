import { test, expect } from "bun:test";
import { stripWriteOnly } from "src/core/tenantConfig/stripWriteOnly";

const schema = {
    properties: {
        maxNotes:     { type: "integer" },
        allowEmoji:   { type: "boolean" },
        secretApiKey: { type: "string", writeOnly: true },
    },
};

test("removes writeOnly fields, keeps the rest", () => {
    const out = stripWriteOnly(
        { maxNotes: 10, allowEmoji: true, secretApiKey: "sk-42" },
        schema,
    );
    expect(out).toEqual({ maxNotes: 10, allowEmoji: true });
});

test("no writeOnly anywhere → unchanged", () => {
    const cfg = { maxNotes: 10, allowEmoji: true };
    expect(stripWriteOnly(cfg, schema)).toEqual(cfg);
});

test("schema sans properties → renvoie tout (faute du provider, pas du helper)", () => {
    expect(stripWriteOnly({ a: 1 }, {})).toEqual({ a: 1 });
});
