import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const importProviderManifestInputSchema = z.strictObject({
    repositoryId: contractString({ maxLength: 256 }),
    publisherId: contractString({ maxLength: 128 }),
    id: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 128 }),
    digest: contractString({ maxLength: 128 }),
});

export const importProviderManifestOutputSchema = z.strictObject({
    id: contractString({ maxLength: 128 }),
    version: contractString({ maxLength: 128 }),
    digest: contractString({ maxLength: 128 }),
});
