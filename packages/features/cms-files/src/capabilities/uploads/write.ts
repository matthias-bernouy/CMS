import { z } from "zod";
import { defineCapability } from "cms-files/capabilities/define";
import { CmsFilesError } from "cms-files/core/credentials";
import { writeUploadInputSchema } from "cms-files/schemas/uploads";
import { writeUploadErrors as errors } from "cms-files/schemas/errors";

export const writeUpload = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "upload.write",
    description: "Stream the exact bytes for an upload session.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "PUT",
            path: "/uploads/{uploadId}",
            input: {
                path: { uploadId: "uploadId" },
                headers: { "upload-token": { property: "uploadToken", encoding: "uri-component" } },
                body: { binaryProperty: "bytes" },
            },
            response: {
                successStatuses: [204],
                contentTypes: [],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    SIZE_MISMATCH: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: writeUploadInputSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services, context }) => {
        if (!context.binaryBody) {
            throw new CmsFilesError("INVALID_INPUT", 422, {}, { code: "file.binary" });
        }
        await services.files.writeUpload(input.uploadId, input.uploadToken, context.binaryBody.stream);
        return null;
    },
});
