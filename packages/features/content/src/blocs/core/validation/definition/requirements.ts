import type { ContentCapabilityRequirement } from "content/application/interfaces/ContentCapabilityRequirement";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { parseVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { isResourceId } from "@bernouy/resource-identity";
import { ContentValidationError } from "content/application/core/validation/errors";

const requirementsSchema = z
    .array(
        z.strictObject({
            contractId: contractString({ minLength: 3, maxLength: 193 }).refine(isResourceId),
            capabilityId: contractString({ minLength: 1, maxLength: 128 }).refine((value) =>
                /^[a-zA-Z][a-zA-Z0-9._-]*$/u.test(value),
            ),
            versionRange: contractString({ minLength: 1, maxLength: 256 }).refine((value) => {
                try {
                    return parseVersionRange(value, "$.requires") === value;
                } catch {
                    return false;
                }
            }),
        }),
    )
    .max(128);

/** Validate metadata only. Host selection and authorization remain separate checks. */
export function validateCapabilityRequirements(value: unknown): readonly ContentCapabilityRequirement[] | undefined {
    if (value === undefined) {
        return;
    }
    const result = requirementsSchema.safeParse(value);
    if (!result.success) {
        throw Object.assign(
            new ContentValidationError("requires", "expected bounded canonical capability dependencies"),
            { cause: result.error },
        );
    }
    const keys = result.data.map((item) => `${item.contractId}:${item.capabilityId}:${item.versionRange}`);
    if (new Set(keys).size !== keys.length) {
        throw new ContentValidationError("requires", "duplicate capability dependency");
    }
    return result.data;
}
