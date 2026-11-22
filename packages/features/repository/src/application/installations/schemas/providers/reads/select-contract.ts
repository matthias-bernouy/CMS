import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const selectContractInputSchema = z.strictObject({
    installationId: contractString({ minLength: 1, maxLength: 96 }),
    contractId: contractString({ minLength: 1, maxLength: 193 }),
    version: contractString({ minLength: 1, maxLength: 64 }),
    digest: contractString({ minLength: 71, maxLength: 71 }),
});
export const selectContractOutputSchema = z.strictObject({
    revision: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
    selected: z
        .array(
            z.strictObject({
                siteId: contractString({ minLength: 1, maxLength: 128 }),
                installationId: contractString({ minLength: 1, maxLength: 96 }),
                contractId: contractString({ minLength: 1, maxLength: 193 }),
                version: contractString({ minLength: 1, maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
            }),
        )
        .max(128)
        .readonly(),
});
