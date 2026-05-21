import { z } from "zod";
import { DeprovisionPolicySchema } from "src/core/schemas/providerConfig";

/** Body of `GET /.well-known/data-provider-info` (base.md §2.0). Public,
 *  unauthenticated — minimal metadata the hub fetches at import time
 *  BEFORE it can mint a CP token (chicken-and-egg solution). */
export const DataProviderInfoSchema = z.object({
    providerId:               z.string(),
    providerKind:             z.string().optional(),
    contractVersion:          z.string(),
    defaultDeprovisionPolicy: DeprovisionPolicySchema,
});
