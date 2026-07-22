import type { StripeAccount, StripeAccountApiVersion } from "../../provider/types.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { accountPatchFromStripeV1 } from "./stripe-v1.ts";
import { accountPatchFromStripeV2 } from "./stripe-v2.ts";

export function accountPatchFromStripe(account: StripeAccount, apiVersion: StripeAccountApiVersion): JsonRecord {
    return apiVersion === "v2" ? accountPatchFromStripeV2(account) : accountPatchFromStripeV1(account);
}
