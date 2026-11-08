import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const listAvailableProvidersOutputSchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
                repositoryId: contractString({ maxLength: 256 }),
                publisherId: contractString({ maxLength: 128 }),
                id: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 128 }),
                digest: contractString({ maxLength: 128 }),
                name: contractString({ maxLength: 256 }),
            }),
        )
        .max(1024)
        .readonly(),
});
