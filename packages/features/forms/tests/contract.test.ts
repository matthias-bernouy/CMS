import { expect, test } from "bun:test";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { formsFeature } from "../src/feature";
import { fields, answers } from "./fixtures";
import { validateAnswers, validateFields } from "../src/core/validation";
import { validRequest } from "../src/core/inputBounds";

test("all eleven field kinds have closed typed answers with no coercion", () => {
    expect(fields).toHaveLength(11);
    expect(() => validateFields(fields)).not.toThrow();
    expect(() => validateAnswers(fields, answers)).not.toThrow();
    for (const value of [
        [{ fieldId: "number", kind: "number", number: "0" }],
        [{ fieldId: "checkbox", kind: "checkbox", boolean: "false" }],
        [{ fieldId: "email", kind: "email", text: "invalid" }],
        [{ fieldId: "consent", kind: "consent", boolean: false }],
        [{ fieldId: "text", kind: "text", text: "hello", number: 0 }],
        [{ fieldId: "single", kind: "single-choice", optionIds: ["foreign"] }],
    ]) {
        expect(() => validateAnswers(fields, value)).toThrow();
    }
    expect(() => validateFields([...fields, fields[0]])).toThrow();
    expect(validRequest({ value: "\ud800" })).toBe(false);
    expect(validRequest({ value: "x".repeat(65536) })).toBe(false);
});

test("the feature compiles to the fifteen declared HTTP/MCP capabilities", async () => {
    const compiled = await compileContract(formsFeature);
    expect(compiled.release.contractId).toBe("ulvia/cms.forms");
    expect(compiled.release.capabilities).toHaveLength(15);
    expect(compiled.release.capabilities.filter((capability) => capability.access === "admin")).toHaveLength(12);
    for (const capability of compiled.release.capabilities.filter((item) => item.access === "admin")) {
        expect(capability.bindings.some((binding) => binding.transport === "mcp")).toBe(true);
    }
});
