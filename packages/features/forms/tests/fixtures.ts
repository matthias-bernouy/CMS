import { draftSchema } from "../src/application/schemas/authoring";
export const fields = [
    { id: "text", kind: "text", label: "Text" },
    { id: "textarea", kind: "textarea", label: "Text area" },
    { id: "email", kind: "email", label: "Email" },
    { id: "tel", kind: "tel", label: "Phone" },
    { id: "url", kind: "url", label: "URL" },
    { id: "number", kind: "number", label: "Number" },
    { id: "date", kind: "date", label: "Date" },
    { id: "checkbox", kind: "checkbox", label: "Checkbox" },
    { id: "single", kind: "single-choice", label: "Single", options: [{ id: "a", label: "A" }] },
    { id: "multiple", kind: "multiple-choice", label: "Multiple", options: [{ id: "a", label: "A" }] },
    { id: "consent", kind: "consent", label: "Consent", required: true, mustBeTrue: true, statement: "I agree" },
] as const;
export const answers = [
    { fieldId: "text", kind: "text", text: "" },
    { fieldId: "textarea", kind: "textarea", text: "hello" },
    { fieldId: "email", kind: "email", text: "a@example.com" },
    { fieldId: "tel", kind: "tel", text: "123" },
    { fieldId: "url", kind: "url", text: "https://example.com" },
    { fieldId: "number", kind: "number", number: 0 },
    { fieldId: "date", kind: "date", text: "2024-02-29" },
    { fieldId: "checkbox", kind: "checkbox", boolean: false },
    { fieldId: "single", kind: "single-choice", optionIds: ["a"] },
    { fieldId: "multiple", kind: "multiple-choice", optionIds: ["a"] },
    { fieldId: "consent", kind: "consent", boolean: true },
] as const;

export const draft = draftSchema.parse({
    title: "Contact",
    locale: "en",
    accessMode: "public",
    retentionDays: 1,
    fields,
    messages: { success: "Received", closed: "Closed" },
});
