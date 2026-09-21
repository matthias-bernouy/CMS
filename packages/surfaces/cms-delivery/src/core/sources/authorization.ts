import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import {
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_SITE_SOURCE_URN,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    sourceUrnOf,
    measureActiveSourceTiming,
    type SourceAuthorizationResult,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

export async function resolveDeliverySubject(delivery: DeliveryCms, req: Request): Promise<Subject | null> {
    const auth = delivery.auth;
    if (!auth) {
        return null;
    }
    return measureActiveSourceTiming(req, "cms_auth", () => resolveRequestSubject(auth.local, req)).catch(() => null);
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
    const sourceUrn = sourceUrnOf(endpoint.urn);
    if ((delivery.auth && sourceUrn === SYSTEM_AUTH_SOURCE_URN) || sourceUrn === SYSTEM_SITE_SOURCE_URN) {
        return true;
    }

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
