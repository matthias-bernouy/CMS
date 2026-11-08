import { z } from "zod";
import { contractString, contractBinary } from "@bernouy/ulvia-sdk";
export const deliveryResolveResourceInputSchema = z.strictObject({
    path: contractString({ minLength: 1, maxLength: 4096 }),
    method: contractString({ enum: ["GET", "HEAD"], maxLength: 4 }),
    query: z
        .array(
            z
                .strictObject({
                    name: contractString({ maxLength: 256 }),
                    value: contractString({ maxLength: 4096 }),
                })
                .readonly(),
        )
        .max(64)
        .readonly(),
});

export const deliveryResolveResourceOutputSchema = contractBinary({ maxBytes: 10737418240, resource: true });
