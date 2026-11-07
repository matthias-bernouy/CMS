import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { catalogueListOutputSchema } from "repository/application/registry/schemas/catalogue/listing";
import { assetDownloadErrors } from "repository/application/registry/schemas/errors";
export const collectionCatalogueInputSchema = z.strictObject({
    "limit": z.int().min(1).max(256),
    "cursor": contractString({ "minLength": 1, "maxLength": 1024 }).optional(),
    "publisherId": contractString({ "minLength": 1, "maxLength": 96 }).optional(),
    "channel": contractString({ "enum": ["stable", "beta", "all"], "maxLength": 6 }).optional(),
});
export { catalogueListOutputSchema };
export { assetDownloadErrors };
