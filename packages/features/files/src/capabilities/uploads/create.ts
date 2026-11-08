import { defineCapability } from "files/capabilities/define";
import { uploadOptions } from "files/capabilities/uploads/options";
import { createUploadInputSchema } from "files/schemas/uploads";
import { uploadReceiptSchema } from "files/schemas/values";
import { createUploadErrors as errors } from "files/schemas/errors";

export const createUpload = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "upload.create",
    description: "Create a bounded upload session, optionally targeting an existing stable file identity.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/uploads",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                    QUOTA_EXCEEDED: 409,
                },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: createUploadInputSchema,
    output: uploadReceiptSchema,
    errors,
    execute: ({ input, services }) =>
        services.files.createUpload({
            namespaceId: input.namespaceId,
            namespaceKey: input.namespaceKey,
            ...uploadOptions(input),
        }),
});
