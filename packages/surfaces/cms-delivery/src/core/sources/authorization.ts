import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { Subject } from "@bernouy/cms-auth";
import { ADMIN_ROLE, PUBLIC_ROLE, canRole } from "@bernouy/cms-permissions";
import {
    SYSTEM_AUTH_SOURCE_URN,
    sourceUrnOf,
    type SourceAuthorizationResult,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

export async function resolveDeliverySubject(delivery: DeliveryCms, req: Request): Promise<Subject<string> | null> {
    const auth = delivery.auth;
    if (!auth) return null;
    return auth.local.getSubject(req).catch(() => null);
}

export async function resolveDeliverySourceContext(delivery: DeliveryCms, req: Request): Promise<Record<string, string>> {
    const subject = await resolveDeliverySubject(delivery, req);
    return subject ? { userID: subject.identifier } : {};
}

export async function authorizeDeliverySourceEndpoint(
    delivery: DeliveryCms,
    endpoint: SourceEndpoint,
    req: Request,
    options: { subject?: Subject<string> | null } = {},
): Promise<SourceAuthorizationResult> {
    if (delivery.auth && sourceUrnOf(endpoint.urn) === SYSTEM_AUTH_SOURCE_URN) return true;

    const roles = delivery.roles;
    if (!roles) return false;

    const subject = Object.prototype.hasOwnProperty.call(options, "subject")
        ? options.subject ?? null
        : await resolveDeliverySubject(delivery, req);
    if (subject?.role === ADMIN_ROLE) return true;

    const definitions = await roles.list();
    if (canRole(subject?.role ?? PUBLIC_ROLE, { definitions }, endpoint.urn)) return true;

    return {
        authorized: false,
        status: subject ? 403 : 401,
    };
}
