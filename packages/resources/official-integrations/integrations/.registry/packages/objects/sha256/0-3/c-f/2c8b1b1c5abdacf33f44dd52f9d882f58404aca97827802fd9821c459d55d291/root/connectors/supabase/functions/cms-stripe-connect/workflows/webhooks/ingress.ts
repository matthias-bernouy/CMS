import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { digest } from "../../shared/crypto.ts";
import { isRecord, objectAt, requiredRecordString, stringAt } from "../../shared/data.ts";
import { stripeLivemode, stripeWebhookMaximumBytes } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { stripeEventCreatedAt, verifyStripeWebhookSignature } from "./validation.ts";

type StripeWebhookEndpointKind = "platform" | "connect" | "connect_v2";
type StripeWebhookRouteHandler = (request: Request) => Promise<Response>;

type StripeWebhookIngressDependencies = {
    insertStripeEventDurably(values: JsonRecord): Promise<boolean>;
};

type StripeWebhookIngress = {
    ingestPlatformWebhook: StripeWebhookRouteHandler;
    ingestConnectWebhook: StripeWebhookRouteHandler;
    ingestConnectV2Webhook: StripeWebhookRouteHandler;
};

export function createStripeWebhookIngress({
    insertStripeEventDurably,
}: StripeWebhookIngressDependencies): StripeWebhookIngress {
    async function ingestStripeWebhook(request: Request, endpointKind: StripeWebhookEndpointKind): Promise<Response> {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > stripeWebhookMaximumBytes) {
            throw new HttpError(413, "Stripe webhook payload is too large");
        }
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > stripeWebhookMaximumBytes) {
            throw new HttpError(413, "Stripe webhook payload is too large");
        }
        const rawBody = new TextDecoder().decode(bytes);
        await verifyStripeWebhookSignature(
            rawBody,
            request.headers.get("stripe-signature") ?? "",
            endpointKind === "platform"
                ? "STRIPE_WEBHOOK_SECRET"
                : endpointKind === "connect_v2"
                  ? "STRIPE_CONNECT_V2_WEBHOOK_SECRET"
                  : "STRIPE_CONNECT_WEBHOOK_SECRET",
        );
        let event: JsonRecord;
        try {
            const parsed = JSON.parse(rawBody);
            if (!isRecord(parsed)) {
                throw new Error("not an object");
            }
            event = parsed;
        } catch {
            throw new HttpError(400, "invalid Stripe event JSON");
        }
        const expectedLivemode = stripeLivemode();
        if (typeof event.livemode !== "boolean" || event.livemode !== expectedLivemode) {
            throw new HttpError(400, "Stripe webhook livemode does not match configured API keys");
        }
        const eventId = requiredRecordString(event, "id", 255);
        const eventType = requiredRecordString(event, "type", 255);
        const providerCreatedAt = stripeEventCreatedAt(event);
        const dataObject = objectAt(objectAt(event, "data"), "object");
        const relatedObject = objectAt(event, "related_object");
        const connectedAccountId =
            endpointKind === "connect_v2" ? stringAt(relatedObject, "id") : stringAt(event, "account");
        if (endpointKind === "platform" && connectedAccountId) {
            throw new HttpError(400, "connected-account event sent to platform Stripe webhook");
        }
        if (endpointKind === "connect" && !connectedAccountId) {
            throw new HttpError(400, "platform event sent to Stripe Connect webhook");
        }
        if (
            endpointKind === "connect_v2" &&
            (!eventType.startsWith("v2.core.account") ||
                stringAt(relatedObject, "type") !== "v2.core.account" ||
                !connectedAccountId)
        ) {
            throw new HttpError(400, "non-account event sent to Stripe Connect v2 webhook");
        }
        const stripeAccountId = connectedAccountId || "platform";
        const payloadSha256 = await digest(rawBody);
        const inserted = await insertStripeEventDurably({
            stripe_account_id: stripeAccountId,
            event_id: eventId,
            event_type: eventType,
            object_id: stringAt(dataObject, "id") || stringAt(relatedObject, "id") || null,
            api_version: stringAt(event, "api_version") || null,
            livemode: event.livemode === true,
            provider_created_at: providerCreatedAt,
            payload_sha256: payloadSha256,
            payload: event,
            processing_status: "pending",
        });
        return json({ received: true, duplicate: !inserted }, inserted ? 202 : 200);
    }

    return {
        ingestPlatformWebhook: (request) => ingestStripeWebhook(request, "platform"),
        ingestConnectWebhook: (request) => ingestStripeWebhook(request, "connect"),
        ingestConnectV2Webhook: (request) => ingestStripeWebhook(request, "connect_v2"),
    };
}
