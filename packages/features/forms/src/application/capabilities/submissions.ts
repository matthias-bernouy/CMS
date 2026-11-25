import { z, contractString } from "@bernouy/ulvia-sdk";
import { defineCapability, errors, query, command, http, mcp } from "forms/application/capabilities/define";
import { submissionInputSchema, submissionAckSchema, answerSchema } from "forms/application/schemas/public";
import { uuidSchema, revisionSchema } from "forms/application/schemas/authoring";
import {
    submissionStatusSchema,
    submissionListInputSchema,
    submissionListOutputSchema,
    submissionStatusInputSchema,
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
});
export const submit = defineCapability({
    id: "forms.submit-v2",
    description: "Durably accept a public submission using a stable caller-generated attempt UUID.",
    access: "public",
    behavior: command,
    input: submissionInputSchema,
    output: submissionAckSchema,
    errors,
    bindings: [http("POST", "/forms/v2/submit")],
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
    id: "forms.submit-authenticated-v2",
    description: "Durably accept an authenticated submission.",
    access: "authenticated",
    behavior: command,
    input: submissionInputSchema,
    output: submissionAckSchema,
    errors,
    bindings: [http("POST", "/forms/v2/submit-authenticated")],
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
    id: "submissions.get-v2",
    description: "Read retained answers and submission status.",
    access: "admin",
    behavior: query,
    input: submissionDeleteInputSchema,
    output,
    errors,
    bindings: [http("QUERY", "/submissions/v2/get"), mcp],
    execute: ({ input, services }) => services.submissions.get(input.receiptId),
});
export const list = defineCapability({
    id: "submissions.list-v2",
    description: "List retained summaries without answers.",
    access: "admin",
    behavior: query,
    input: submissionListInputSchema,
    output: submissionListOutputSchema,
    errors,
    bindings: [http("QUERY", "/submissions/v2/list"), mcp],
    execute: ({ input, services }) => services.submissions.list(input),
});
export const status = defineCapability({
    id: "submissions.set-status-v2",
    description: "Change a retained submission status at its current revision.",
    access: "admin",
    behavior: command,
    input: submissionStatusInputSchema,
    output: submissionChangeAckSchema,
    errors,
    bindings: [http("PUT", "/submissions/v2/status"), mcp],
    execute: ({ input, services }) => services.submissions.status(input),
});
export const remove = defineCapability({
    id: "submissions.delete-v2",
    description:
        "Erase the local submission payload and pending Event intent. Already published Events and Workflow effects have their own lifecycle.",
    access: "admin",
    behavior: command,
    input: submissionDeleteInputSchema,
    output: submissionDeleteAckSchema,
    errors,
    bindings: [http("DELETE", "/submissions/v2"), mcp],
    execute: ({ input, services }) => services.submissions.delete(input.receiptId),
});
