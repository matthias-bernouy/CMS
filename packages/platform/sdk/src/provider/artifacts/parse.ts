import { z } from "zod";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import { SDK_BUILD_LIMITS } from "ulvia-sdk/compiler/limits";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

const text = z.string().min(1).max(512);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const requirement = z.strictObject({ contractId: text, capabilityId: text, versionRange: text, optional: z.boolean() });
const delegation = z.strictObject({
    sources: z.array(text).max(512),
    allow: z
        .array(
            z.strictObject({
                contractId: text,
                capabilityId: text,
                effect: z.enum(["query", "command", "*"]),
                sensitive: z.boolean().optional(),
            }),
        )
        .max(512),
});
const artifactSchema = z.strictObject({
    kind: z.literal("ulvia-sdk-runtime/v1"),
    contracts: z
        .array(z.strictObject({ canonicalJson: z.string().max(DEFAULT_RELEASE_LIMITS.maxDocumentBytes), digest }))
        .max(SDK_BUILD_LIMITS.contracts),
    implementations: z
        .array(
            z.strictObject({
                contractId: text,
                version: text,
                digest,
                requires: z.array(requirement).max(512),
                delegation: delegation.optional(),
            }),
        )
        .max(SDK_BUILD_LIMITS.contracts),
});

export function parseImplementationArtifact(value: unknown) {
    const artifact = artifactSchema.parse(value);
    let totalBytes = 0;
    const encoder = new TextEncoder();
    for (const contract of artifact.contracts) {
        totalBytes += encoder.encode(contract.canonicalJson).length;
        if (totalBytes > 64 * 1024 * 1024) {
            throw new SdkDefinitionError("Runtime contract metadata exceeds its 64 MiB budget");
        }
    }
    return artifact;
}
