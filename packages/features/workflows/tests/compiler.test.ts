import { expect, test } from "bun:test";
import { compileWorkflow } from "@bernouy/workflows";
import { definition, fixture } from "./support/fixture";

test("workflow compilation validates branch availability, exact schemas, cycles and JSON-only execution", async () => {
    const f = fixture();
    const plan = await compileWorkflow(JSON.stringify(definition), f.services.contracts);
    expect(plan.capabilities.notify!.target.version).toBe("1.0.0");
    expect(plan.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    await expect(
        compileWorkflow(
            JSON.stringify({ ...definition, output: { kind: "step", stepId: "notify", path: "" } }),
            f.services.contracts,
        ),
    ).rejects.toHaveProperty("code", "INVALID_DEFINITION");
    const cycle = structuredClone(definition);
    Object.assign(cycle.steps[0]!, { next: "read" });
    await expect(compileWorkflow(JSON.stringify(cycle), f.services.contracts)).rejects.toHaveProperty(
        "code",
        "INVALID_DEFINITION",
    );
    const wrong = structuredClone(definition);
    Object.assign(wrong.steps[2]!, { input: { kind: "literal", value: { email: false } } });
    await expect(compileWorkflow(JSON.stringify(wrong), f.services.contracts)).rejects.toHaveProperty(
        "code",
        "INVALID_DEFINITION",
    );
    f.capabilities["orders.notify"]!.capability = {
        ...f.capabilities["orders.notify"]!.capability,
        output: { type: "binary", maxBytes: 1024 },
    };
    await expect(compileWorkflow(JSON.stringify(definition), f.services.contracts)).rejects.toHaveProperty(
        "code",
        "INVALID_DEFINITION",
    );
});

test("optional fields require a present branch and cannot leak into the other branch", async () => {
    const f = fixture();
    f.capabilities["orders.read"]!.capability = {
        ...f.capabilities["orders.read"]!.capability,
        output: {
            type: "object",
            properties: { email: { type: "string", format: "email", maxLength: 128 } },
            required: [],
        },
    };
    const guarded = structuredClone(definition);
    Object.assign(guarded.steps[1]!, {
        test: { kind: "exists", value: { kind: "step", stepId: "read", path: "/email" } },
    });
    expect((await compileWorkflow(JSON.stringify(guarded), f.services.contracts)).format).toBe(
        "ulvia-workflow-plan/v1",
    );
    Object.assign(guarded.steps[1]!, { then: null, otherwise: "notify" });
    await expect(compileWorkflow(JSON.stringify(guarded), f.services.contracts)).rejects.toHaveProperty(
        "code",
        "INVALID_DEFINITION",
    );
});

test("literal arrays and structural construction use the target schema; invalid definitions return diagnostics", async () => {
    const f = fixture();
    const current = f.capabilities["orders.notify"]!;
    current.capability = {
        ...current.capability,
        input: {
            type: "object",
            properties: { values: { type: "array", items: { type: "integer", minimum: 0, maximum: 10 }, maxItems: 3 } },
            required: ["values"],
        },
    };
    const valid = {
        ...definition,
        steps: definition.steps.map((step) =>
            step.id === "notify"
                ? {
                      ...step,
                      input: {
                          kind: "object",
                          fields: {
                              values: {
                                  kind: "array",
                                  items: [
                                      { kind: "literal", value: 1 },
                                      { kind: "literal", value: 2 },
                                  ],
                              },
                          },
                      },
                  }
                : step,
        ),
    };
    await expect(compileWorkflow(JSON.stringify(valid), f.services.contracts)).resolves.toHaveProperty("digest");
    await f.definitions.create(
        "invalid",
        JSON.stringify({ ...definition, output: { kind: "literal", value: "wrong-type" } }),
        "{}",
    );
    expect(await f.definitions.validate("invalid", 1)).toMatchObject({
        valid: false,
        issues: [{ code: "INVALID_DEFINITION" }],
    });
});

test("repeated references cannot expand a retained value beyond the expression byte budget", () => {
    const input = "x".repeat(8 * 1024 * 1024);
    expect(() =>
        evaluateExpression(
            {
                kind: "object",
                fields: {
                    a: { kind: "input", path: "" },
                    b: { kind: "input", path: "" },
                    c: { kind: "input", path: "" },
                },
            },
            { input, steps: {}, errors: {} },
        ),
    ).toThrow("The workflow request was refused");
});
import { evaluateExpression } from "../src/core/expressions/evaluate";

test("manual run identity conflicts are domain refusals and preserve the original input", async () => {
    const f = fixture();
    await f.definitions.create("workflow", JSON.stringify(definition), "{}");
    await f.definitions.publish("workflow", 1);
    const original = await f.runs.start("run", "workflow", 1, "admin", { id: "first" });
    await expect(f.runs.start("run", "workflow", 1, "admin", { id: "changed" })).rejects.toHaveProperty(
        "code",
        "RUN_CONFLICT",
    );
    expect(await f.store.get(original.id, original.inputRef)).toEqual({ id: "first" });
    expect(f.store.runRecords.size).toBe(1);
    expect((await f.runs.start("run", "workflow", 1, "admin", { id: "first" })).id).toBe(original.id);
});
