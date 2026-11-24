import { expect, test } from "bun:test";
import { resourceUseViolation } from "@bernouy/workflows";
import type { WorkflowResourceUse } from "@bernouy/workflows";
import { schemaDescriptorProjection } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaObjectSchema } from "@bernouy/ulvia-contracts/schema";
const schema: UlviaObjectSchema = {
    type: "object",
    properties: {
        email: { type: "string", maxLength: 320 },
        budget: { type: "number" },
        note: { type: "string", maxLength: 128 },
    },
    required: ["email", "note"],
};
const use: WorkflowResourceUse = {
    sourceContractId: "ulvia/cms.forms",
    sourceInstallationId: "forms",
    resources: [{ path: "", resolver: "forms.describe", resourceId: "contact", version: "1", digest: "sha256:old" }],
    schema,
    paths: ["/email"],
};
const candidate = (next: UlviaObjectSchema): UlviaObjectSchema => next;
const descriptor = (next: UlviaObjectSchema) => ({
    resourceId: "contact",
    version: "2",
    digest: "sha256:new",
    schema: next,
    fields: Object.keys(next.properties).map((property) => ({
        id: property,
        property,
        label: property,
        sensitive: false,
    })),
});
test("unused fields can disappear and unrelated fields can be added without breaking mappings", () => {
    expect(
        resourceUseViolation(
            use,
            candidate({
                type: "object",
                properties: { email: schema.properties.email!, extra: { type: "integer" } },
                required: ["email"],
            }),
        ),
    ).toBeUndefined();
});
test("used fields cannot disappear, change type, become optional or become sensitive", () => {
    expect(resourceUseViolation(use, candidate({ type: "object", properties: {}, required: [] }))).toBeDefined();
    expect(
        resourceUseViolation(
            use,
            candidate({ ...schema, properties: { ...schema.properties, email: { type: "integer" } } }),
        ),
    ).toBeDefined();
    expect(resourceUseViolation(use, candidate({ ...schema, required: ["note"] }))).toBeDefined();
    const privateEmail = descriptor(schema);
    expect(
        resourceUseViolation(
            use,
            schemaDescriptorProjection({
                ...privateEmail,
                fields: privateEmail.fields.map((field) => ({ ...field, sensitive: field.property === "email" })),
            }),
        ),
    ).toBeDefined();
});
test("reading the whole resource consumes its entire contract; metadata-only workflows consume no fields", () => {
    const next = candidate({ type: "object", properties: { email: schema.properties.email! }, required: ["email"] });
    expect(resourceUseViolation({ ...use, paths: [""] }, next)).toBeDefined();
    expect(resourceUseViolation({ ...use, paths: [] }, next)).toBeUndefined();
});
