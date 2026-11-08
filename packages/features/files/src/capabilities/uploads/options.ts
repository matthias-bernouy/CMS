import type { z } from "zod";
import type { createWorkspaceUploadInputSchema } from "files/schemas/workspace";
import { boundedText } from "files/core/validation";

/** Normalize nullable wire options once for both credential-owned and managed uploads. */
export function uploadOptions(input: z.infer<typeof createWorkspaceUploadInputSchema>) {
    return {
        filename: input.filename,
        size: input.size,
        ...(input.contentType ? { mimeType: input.contentType } : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.imageProfile ? { imageProfile: input.imageProfile } : {}),
        ...(typeof input.fileId === "string" ? { fileId: boundedText(input.fileId, 128) } : {}),
    };
}
