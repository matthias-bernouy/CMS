import { z } from "./zodInit";

export const PreflightResultSchema = z.object({
    status: z.literal("ready"),
}).openapi("PreflightResult");
