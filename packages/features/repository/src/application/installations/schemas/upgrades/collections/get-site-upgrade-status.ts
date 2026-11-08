import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const getSiteUpgradeStatusOutputSchema = z.strictObject({
    maintenance: z.boolean(),
    activeUpgrade: z
        .strictObject({
            id: contractString({ maxLength: 71 }),
            status: contractString({ maxLength: 16 }),
            createdAt: contractString({ maxLength: 40, format: "date-time" }),
            kind: contractString({ maxLength: 16, enum: ["collection", "contracts"] }),
        })
        .optional(),
});
