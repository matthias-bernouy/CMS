import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { Subject } from "@bernouy/cms-auth";
import {
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    measureActiveSourceTiming,
    type SourceAuthorizationResult,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

export async function resolveDeliverySubject(delivery: DeliveryCms, req: Request): Promise<Subject | null> {
    const auth = delivery.auth;
    if (!auth) {
        return null;
    }
    return measureActiveSourceTiming(req, "cms_auth", () => auth.subject(req)).catch(() => null);
}

export async function resolveDeliverySourceContext(
    delivery: DeliveryCms,
    req: Request,
): Promise<Record<string, string>> {
    const subject = await resolveDeliverySubject(delivery, req);
    return subject ? { userID: subject.identifier } : {};
}

export async function authorizeDeliverySourceEndpoint(
    delivery: DeliveryCms,
    endpoint: SourceEndpoint,
    req: Request,
    options: { subject?: Subject | null } = {},
): Promise<SourceAuthorizationResult> {
    const subject = Object.prototype.hasOwnProperty.call(options, "subject")
        ? (options.subject ?? null)
        : await resolveDeliverySubject(delivery, req);

    if (!sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), subject ? "auth" : "public")) {
        return {
            authorized: false,
            status: subject ? 403 : 401,
        };
    }

    return true;
}
