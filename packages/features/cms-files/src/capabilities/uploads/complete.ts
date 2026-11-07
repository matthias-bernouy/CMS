import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { completeUploadInputSchema } from "cms-files/schemas/uploads";
import { fileReferenceSchema } from "cms-files/schemas/values";
import { completeUploadErrors as errors } from "cms-files/schemas/errors";

export const completeUpload = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "upload.complete",
    description: "Finalize an uploaded blob into an immutable generation.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/uploads/{uploadId}/complete",
            input: { path: { uploadId: "uploadId" }, body: { properties: ["namespaceId", "namespaceKey"] } },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                    QUOTA_EXCEEDED: 409,
                    UPLOAD_NOT_READY: 409,
                },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: completeUploadInputSchema,
    output: fileReferenceSchema,
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, () =>
            services.files.completeUpload(input.namespaceId, input.namespaceKey, input.uploadId),
        ),
});
