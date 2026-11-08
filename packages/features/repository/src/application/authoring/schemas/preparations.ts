import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { authoringDiagnosticSchema } from "repository/application/authoring/schemas/common";
export const prepareInputSchema = z.strictObject({
    sourceJson: contractString({
        maxLength: 1048576,
        sensitive: true,
        description:
            "Complete JSON source snapshot with files: [{path, content}] and optional immutable fixture asset references. Read the linked source guide first.",
    }),
});

export const prepareContractOutputSchema = z
    .strictObject({
        valid: z.boolean().describe("Publish only when valid is true and a preparationId and digest were returned."),
        diagnostics: z.array(authoringDiagnosticSchema).max(16).readonly(),
        repositoryId: contractString({ maxLength: 96 }).optional(),
        publisherId: contractString({ maxLength: 96 }).optional(),
        version: contractString({ maxLength: 64 }).optional(),
        digest: contractString({ maxLength: 71 }).optional(),
        preparationId: contractString({ maxLength: 36 }).optional(),
        sourceDigest: contractString({ maxLength: 71 }).optional(),
        contractId: contractString({ maxLength: 193 }).optional(),
    })
    .readonly();

export const prepareProviderManifestOutputSchema = z
    .strictObject({
        valid: z.boolean().describe("Publish only when valid is true and a preparationId and digest were returned."),
        diagnostics: z.array(authoringDiagnosticSchema).max(16).readonly(),
        repositoryId: contractString({ maxLength: 96 }).optional(),
        publisherId: contractString({ maxLength: 96 }).optional(),
        version: contractString({ maxLength: 64 }).optional(),
        digest: contractString({ maxLength: 71 }).optional(),
        preparationId: contractString({ maxLength: 36 }).optional(),
        sourceDigest: contractString({ maxLength: 71 }).optional(),
        providerId: contractString({ maxLength: 193 }).optional(),
    })
    .readonly();

export const discardPreparationInputSchema = z.strictObject({
    preparationId: contractString({ maxLength: 36 }),
});

export const discardPreparationOutputSchema = z
    .strictObject({
        discarded: z.boolean(),
    })
    .readonly();

export const prepareCollectionInputSchema = z.strictObject({
    sourceJson: contractString({
        maxLength: 1048576,
        sensitive: true,
        description:
            "JSON object with files: [{path, content}] and optional exact asset references. Read collection-source.md and bloc-design.md first. Maximum 1 MiB of source JSON.",
    }),
});

export const prepareCollectionOutputSchema = z
    .strictObject({
        valid: z.boolean().describe("Publish only when valid is true and a preparationId and digest were returned."),
        diagnostics: z.array(authoringDiagnosticSchema).max(16).readonly(),
        repositoryId: contractString({ maxLength: 96 }).optional(),
        publisherId: contractString({ maxLength: 96 }).optional(),
        collectionId: contractString({ maxLength: 193 }).optional(),
        version: contractString({ maxLength: 64 }).optional(),
        digest: contractString({ maxLength: 71 }).optional(),
        preparationId: contractString({ maxLength: 36 }).optional(),
        sourceDigest: contractString({ maxLength: 71 }).optional(),
        approvedBrowserRiskDigest: contractString({ maxLength: 71 }).optional(),
        browserRisk: contractString({ maxLength: 64 }).optional(),
        preflight: contractString({
            maxLength: 10,
            enum: ["complete", "incomplete"],
            description:
                "Whether the authoritative Repository publication-history check completed. Incomplete preparation retains a warning and publication still rechecks current state.",
        }).optional(),
    })
    .readonly();
