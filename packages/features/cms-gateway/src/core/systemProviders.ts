import type { DataShape } from "../interfaces/DataShape";
import type { Provider } from "../interfaces/Gateway";
import { makeEndpointUrn, makeProviderUrn, parseUrn } from "./urn";

export const SYSTEM_PROVIDER_ID_PREFIX = "system-";
export const SYSTEM_AUTH_PROVIDER_ID = "system-auth";
export const SYSTEM_AUTH_PROVIDER_URN = makeProviderUrn(SYSTEM_AUTH_PROVIDER_ID);

const SYSTEM_TARGET_SCHEME = "cms-system://";

const stringShape = (): DataShape => ({ type: "string" });
const booleanShape = (): DataShape => ({ type: "boolean" });
const objectShape = (properties: Record<string, DataShape>, required: string[] = []): DataShape => ({
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
});

const subjectShape = objectShape({
    identifier: stringShape(),
    role:       stringShape(),
});

const okShape = objectShape({ ok: booleanShape() });
const emailBody = objectShape({ email: stringShape() }, ["email"]);
const tokenBody = objectShape({ token: stringShape() }, ["token"]);

export const SYSTEM_AUTH_PROVIDER: Provider = {
    urn: SYSTEM_AUTH_PROVIDER_URN,
    meta: {
        name:        "Authentication",
        description: "Built-in first-party authentication actions.",
    },
    endpoints: [
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "me"),
            method:    "GET",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/me`,
            meta:      { name: "Current user" },
            output:    [{ status: "200", body: objectShape({ subject: subjectShape }) }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "login"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/login`,
            meta:      { name: "Log in" },
            input:     { body: objectShape({ email: stringShape(), password: stringShape(), returnTo: stringShape() }, ["email", "password"]) },
            output:    [{ status: "200", body: objectShape({ subject: subjectShape }) }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "logout"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/logout`,
            meta:      { name: "Log out" },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "signup"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/signup`,
            meta:      { name: "Sign up" },
            input:     { body: objectShape({ email: stringShape(), password: stringShape(), displayName: stringShape() }, ["email", "password"]) },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "requestEmailVerification"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/email/verification/request`,
            meta:      { name: "Request email verification" },
            input:     { body: emailBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "confirmEmailVerification"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/email/verification/confirm`,
            meta:      { name: "Confirm email verification" },
            input:     { body: tokenBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "requestPasswordReset"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/password/reset/request`,
            meta:      { name: "Request password reset" },
            input:     { body: emailBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_PROVIDER_ID, "confirmPasswordReset"),
            method:    "POST",
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/password/reset/confirm`,
            meta:      { name: "Confirm password reset" },
            input:     { body: objectShape({ token: stringShape(), password: stringShape() }, ["token", "password"]) },
            output:    [{ status: "200", body: okShape }],
        },
    ],
};

export const SYSTEM_GATEWAY_PROVIDERS: readonly Provider[] = [SYSTEM_AUTH_PROVIDER];

export function isSystemProviderId(providerId: string): boolean {
    return providerId.startsWith(SYSTEM_PROVIDER_ID_PREFIX);
}

export function isSystemProviderUrn(urn: string): boolean {
    const parsed = parseUrn(urn);
    return parsed !== null && parsed.endpoint === null && isSystemProviderId(parsed.provider);
}

export function systemProviderUrnOf(urn: string): string | null {
    const parsed = parseUrn(urn);
    if (!parsed || !isSystemProviderId(parsed.provider)) return null;
    return makeProviderUrn(parsed.provider);
}
