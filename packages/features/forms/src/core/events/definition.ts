import { defineEvent, contractString, contractResolved, z } from "@bernouy/ulvia-sdk";
const formId = contractString({ format: "uuid", maxLength: 36 });
export const submissionCreated = defineEvent({
    id: "submission.created",
    description: "A validated submission and its event intent have been durably accepted for a published form version.",
    sensitive: false,
    schema: z.strictObject({
        formId,
        formVersion: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
        submissionId: contractString({ format: "uuid", maxLength: 36 }),
        answers: contractResolved({
            resolver: "forms.describe-submission",
            choices: "forms.list-submission-sources",
            selector: { formId: { source: "value", path: "/formId" } },
            version: { source: "value", path: "/formVersion" },
        }),
        receivedAt: contractString({ format: "date-time", maxLength: 32 }),
    }),
    filterKeys: ["formId"],
});
