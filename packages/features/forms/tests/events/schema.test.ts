import { validateFields } from "@bernouy/forms";
import { expect, test } from "bun:test";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { formsFeature } from "@bernouy/forms/feature";
import { describeSubmissionFields, submissionValues, answerProperty } from "@bernouy/forms";
import type { FormField } from "forms/application/schemas/fields";
import { parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";

const fields: readonly FormField[] = [
    { id: "email", kind: "email", label: "Email", required: true },
    { id: "budget", kind: "number", label: "Budget", min: 0 },
    { id: "last-name", kind: "text", label: "Last name", maxLength: 128 },
    {
        id: "consent",
        kind: "consent",
        label: "Consent",
        statement: "Contact permission",
        required: true,
        mustBeTrue: true,
    },
];
test("Forms declares a contract-owned standard schema resolver", async () => {
    const admission = await compileContract(formsFeature);
    expect(admission.release.version).toBe("2.0.0");
    const event = admission.release.events![0]!;
    expect(event.filterKeys).toEqual(["formId"]);
    expect(event.schema.type === "object" && event.schema.properties.answers).toMatchObject({
        type: "resolved",
        resolver: "forms.describe-submission",
        selector: { formId: { source: "value", path: "/formId" } },
        version: { source: "value", path: "/formVersion" },
    });
});
test("one form definition produces validated Ulvia schemas and normalized values with stable field identities", () => {
    const descriptor = describeSubmissionFields("contact", 1, fields);
    const resource = parseSchemaDescriptor(descriptor);
    const answers = submissionValues(fields, [
        { fieldId: "email", kind: "email", text: "contact@example.com" },
        { fieldId: "budget", kind: "number", number: 42 },
        { fieldId: "last-name", kind: "text", text: "Example" },
        { fieldId: "consent", kind: "consent", boolean: true },
    ]);
    expect(() => validateSchemaValue(resource.schema, answers)).not.toThrow();
    expect(answers[answerProperty("last-name")]).toBe("Example");
    expect(resource.fields.find(({ id }) => id === "last-name")!.property).toBe(answerProperty("last-name"));
    expect(() => validateSchemaValue(resource.schema, { ...answers, budget: "42" })).toThrow();
});
test("label changes preserve resource contract digests, while sensitivity and types change them", () => {
    const first = describeSubmissionFields("contact", 1, fields);
    const relabelled = describeSubmissionFields(
        "contact",
        2,
        fields.map((field) => ({ ...field, label: `New ${field.label}` })),
    );
    expect(relabelled.digest).toBe(first.digest);
    const sensitive = describeSubmissionFields(
        "contact",
        3,
        fields.map((field) => ({ ...field, sensitive: true })),
    );
    expect(() => validateFields(fields.map((field) => ({ ...field, sensitive: true })))).not.toThrow();
    expect(sensitive.digest).not.toBe(first.digest);
    expect(() => parseSchemaDescriptor({ ...sensitive, digest: first.digest })).toThrow();
});
test("resource schemas remain bounded while supporting form catalogs larger than static contract objects", () => {
    const many = Array.from(
        { length: 300 },
        (_, index): FormField => ({ id: `field${index}`, kind: "number", label: `Field ${index}` }),
    );
    const resource = parseSchemaDescriptor(describeSubmissionFields("survey", 1, many));
    expect(resource.fields).toHaveLength(300);
});
