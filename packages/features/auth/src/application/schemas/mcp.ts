import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const mcpRequestSchema = z.strictObject({
    requestJson: contractString({ maxLength: 16384, sensitive: true }),
});

export const mcpResultSchema = z
    .strictObject({
        resultJson: contractString({ maxLength: 1048576, sensitive: true }),
    })
    .readonly();
