import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const resumeContractUpgradeInputSchema = z.strictObject({
    upgradeId: contractString({ minLength: 71, maxLength: 71 }),
});
