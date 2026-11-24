import { z, contractString } from "@bernouy/ulvia-sdk";
import { defineCapability, errors, query, command, http, mcp } from "forms/application/capabilities/define";
import { submissionInputSchema, submissionAckSchema, answerSchema } from "forms/application/schemas/public";
import { uuidSchema, revisionSchema } from "forms/application/schemas/authoring";
import {
    submissionStatusSchema,
    submissionListInputSchema,
    submissionListOutputSchema,
    submissionStatusInputSchema,
    submissionRetryInputSchema,
    submissionDeleteInputSchema,
    submissionChangeAckSchema,
    submissionDeleteAckSchema,
} from "forms/application/schemas/submissions";

const output = z.strictObject({
    receiptId: uuidSchema,
    formId: uuidSchema,
    formVersion: revisionSchema,
    receivedAt: contractString({ maxLength: 24 }),
    expiresAt: contractString({ maxLength: 24 }),
    status: submissionStatusSchema,
    revision: revisionSchema,
    answers: z.array(answerSchema).max(8192),
    notifications: z
        .array(
            z.strictObject({
                index: z.int().min(0).max(8191),
                generation: revisionSchema,
                state: contractString({
                    enum: ["pending", "sending", "accepted", "blocked", "failed", "unknown"] as const,
                    maxLength: 8,
                }),
            }),
        )
        .max(8192),
});
export const submit = defineCapability({
    id: "forms.submit",
    description: "Durably accept a public submission using a stable caller-generated attempt UUID.",
    access: "public",
    behavior: command,
    input: submissionInputSchema,
    output: submissionAckSchema,
    errors,
    bindings: [http("POST", "/forms/submit")],
    execute: ({ input, services, context }) =>
        services.submissions.submit(
            input,
            services.principal(context),
            "public",
            context.eventCausation,
            () => services.captureInitiator?.(context, input.attemptId) ?? Promise.resolve(undefined),
        ),
});
export const submitAuthenticated = defineCapability({
    id: "forms.submit-authenticated",
    description: "Durably accept an authenticated submission.",
    access: "authenticated",
    behavior: command,
    input: submissionInputSchema,
    output: submissionAckSchema,
    errors,
    bindings: [http("POST", "/forms/submit-authenticated")],
    execute: ({ input, services, context }) =>
        services.submissions.submit(
            input,
            services.principal(context),
            "authenticated",
            context.eventCausation,
            () => services.captureInitiator?.(context, input.attemptId) ?? Promise.resolve(undefined),
        ),
});
export const get = defineCapability({
    id: "submissions.get",
    description: "Read retained answers and notification outcomes.",
    access: "admin",
    behavior: query,
    input: submissionDeleteInputSchema,
    output,
    errors,
    bindings: [http("QUERY", "/submissions/get"), mcp],
    execute: ({ input, services }) => services.submissions.get(input.receiptId),
});
export const list = defineCapability({
    id: "submissions.list",
    description: "List retained summaries without answers.",
    access: "admin",
    behavior: query,
    input: submissionListInputSchema,
    output: submissionListOutputSchema,
    errors,
    bindings: [http("QUERY", "/submissions/list"), mcp],
    execute: ({ input, services }) => services.submissions.list(input),
});
export const status = defineCapability({
    id: "submissions.set-status",
    description: "Change a retained submission status at its current revision.",
    access: "admin",
    behavior: command,
    input: submissionStatusInputSchema,
    output: submissionChangeAckSchema,
    errors,
    bindings: [http("PUT", "/submissions/status"), mcp],
    execute: ({ input, services }) => services.submissions.status(input),
});
export const retry = defineCapability({
    id: "submissions.retry-notification",
    description:
        "Retry a blocked or failed notification; unknown delivery requires explicit duplicate-risk acceptance.",
    access: "admin",
    behavior: command,
    input: submissionRetryInputSchema,
    output: submissionChangeAckSchema,
    errors,
    bindings: [http("POST", "/submissions/retry-notification"), mcp],
    execute: ({ input, services }) => services.submissions.retry(input),
});
export const remove = defineCapability({
    id: "submissions.delete",
    description: "Erase local payload. A previously committed send may still complete.",
    access: "admin",
    behavior: command,
    input: submissionDeleteInputSchema,
    output: submissionDeleteAckSchema,
    errors,
    bindings: [http("DELETE", "/submissions"), mcp],
    execute: ({ input, services }) => services.submissions.delete(input.receiptId),
});
