import type { JsonRecord } from "../shared/types.ts";
import { stripeV1 } from "./stripe-client.ts";

export async function retrieveStripePayout(payoutId: string, stripeAccountId: string): Promise<JsonRecord> {
    const headers = new Headers();
    if (stripeAccountId !== "platform") {
        headers.set("stripe-account", stripeAccountId);
    }
    return await stripeV1<JsonRecord>(`/payouts/${encodeURIComponent(payoutId)}`, {
        method: "GET",
        headers,
    });
}
