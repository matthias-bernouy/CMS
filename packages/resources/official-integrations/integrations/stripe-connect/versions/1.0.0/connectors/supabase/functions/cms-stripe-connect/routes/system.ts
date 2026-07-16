import { requiredEnv, stripeLivemode } from "../config/runtime.ts";
import { requireCmsRequest } from "../http/auth.ts";
import { json } from "../http/responses.ts";

export async function health(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({ ok: true, stripeMode: stripeLivemode() ? "live" : "test" });
}

export async function connectConfig(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ publishableKey: requiredEnv("STRIPE_PUBLISHABLE_KEY") });
}
