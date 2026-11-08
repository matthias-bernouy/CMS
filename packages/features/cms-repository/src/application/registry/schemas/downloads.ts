import { z } from "zod";
import { contractString, contractBinary } from "@bernouy/ulvia-sdk";
export const assetDownloadInputSchema = z.strictObject({
    kind: contractString({ minLength: 1, maxLength: 32, enum: ["collection", "contract", "provider-manifest"] }),
    publisherId: contractString({ minLength: 1, maxLength: 96 }),
    id: contractString({ minLength: 1, maxLength: 193 }),
    version: contractString({ minLength: 1, maxLength: 128 }),
    assetId: contractString({ minLength: 1, maxLength: 512 }),
});

export const assetDownloadOutputSchema = contractBinary({ maxBytes: 104857600 });

export const releaseDownloadOutputSchema = contractBinary({ maxBytes: 8388608 });
