import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const resumeCollectionUpgradeInputSchema = z.strictObject({
    upgradeId: contractString({ maxLength: 71 }),
});
