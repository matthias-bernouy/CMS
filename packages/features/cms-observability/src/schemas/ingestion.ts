import { z } from "zod";
import { logEntrySchema } from "./entries";
export const appendLogsInputSchema = z.strictObject({
    entries: z.array(logEntrySchema).min(1).max(50).readonly(),
});
export const appendLogsOutputSchema = z
    .strictObject({
        accepted: z.int().min(0).max(9007199254740991),
        stored: z.int().min(0).max(9007199254740991),
        duplicates: z.int().min(0).max(9007199254740991),
    })
    .readonly();
