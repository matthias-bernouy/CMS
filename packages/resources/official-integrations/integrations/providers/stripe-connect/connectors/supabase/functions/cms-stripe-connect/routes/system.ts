import { requiredEnv, stripeLivemode } from "../shared/runtime.ts";
import { requireCmsRequest } from "../http/auth.ts";
import { json } from "../http/responses.ts";

export async function health(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    let configured = false;
    try {
        stripeLivemode();
        configured = true;
    } catch {
        /* Missing business settings must not block diagnostics. */
    }
    return json({
        schemaVersion: 1,
        status: configured ? "unknown" : "needs_configuration",
        checkedAt: new Date().toISOString(),
        checks: [
            {
                id: "connection",
                status: configured ? "unknown" : "warning",
                message: configured
                    ? "Run Source Health to verify live credentials and webhook configuration."
                    : "Configure the Stripe connection in Source settings.",
            },
        ],
    });
}

export async function connectConfig(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ publishableKey: requiredEnv("STRIPE_PUBLISHABLE_KEY") });
}

export async function providerConfiguration(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({ sellerPayoutSchedule: Deno.env.get("STRIPE_CONNECT_SELLER_PAYOUT_SCHEDULE") ?? "daily" });
}
