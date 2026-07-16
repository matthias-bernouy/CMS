import type { DataShape } from "../interfaces/DataShape";
import type { Source } from "../interfaces/Source";
import { makeEndpointUrn, makeSourceUrn, parseUrn } from "./urn";

export const SYSTEM_SOURCE_ID_PREFIX = "system-";
export const SYSTEM_AUTH_SOURCE_ID = "system-auth";
export const SYSTEM_AUTH_SOURCE_URN = makeSourceUrn(SYSTEM_AUTH_SOURCE_ID);

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
    email:      stringShape(),
    role:       stringShape(),
});

const okShape = objectShape({ ok: booleanShape() });
const emailBody = objectShape({ email: stringShape() }, ["email"]);
const tokenBody = objectShape({ token: stringShape() }, ["token"]);

export const SYSTEM_AUTH_SOURCE: Source = {
    urn: SYSTEM_AUTH_SOURCE_URN,
    meta: {
        name:        "Authentication",
        description: "Built-in first-party authentication actions.",
    },
    endpoints: [
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "me"),
            method:    "GET",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/me`,
            meta:      { name: "Current user" },
            output:    [{ status: "200", body: objectShape({ subject: subjectShape }) }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "login"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/login`,
            meta:      { name: "Log in" },
            input:     { body: objectShape({ email: stringShape(), password: stringShape(), returnTo: stringShape() }, ["email", "password"]) },
            output:    [{ status: "200", body: objectShape({ subject: subjectShape }) }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "logout"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/logout`,
            meta:      { name: "Log out" },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "signup"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/signup`,
            meta:      { name: "Sign up" },
            input:     { body: objectShape({ email: stringShape(), password: stringShape() }, ["email", "password"]) },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "requestEmailVerification"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/email/verification/request`,
            meta:      { name: "Request email verification" },
            input:     { body: emailBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "confirmEmailVerification"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/email/verification/confirm`,
            meta:      { name: "Confirm email verification" },
            input:     { body: tokenBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "requestPasswordReset"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/password/reset/request`,
            meta:      { name: "Request password reset" },
            input:     { body: emailBody },
            output:    [{ status: "200", body: okShape }],
        },
        {
            urn:       makeEndpointUrn(SYSTEM_AUTH_SOURCE_ID, "confirmPasswordReset"),
            method:    "POST",
            access:    { mode: "public" },
            targetUrl: `${SYSTEM_TARGET_SCHEME}auth/password/reset/confirm`,
            meta:      { name: "Confirm password reset" },
            input:     { body: objectShape({ token: stringShape(), password: stringShape() }, ["token", "password"]) },
            output:    [{ status: "200", body: okShape }],
        },
    ],
};

export const SYSTEM_SOURCES: readonly Source[] = [SYSTEM_AUTH_SOURCE];

export function isSystemSourceId(sourceId: string): boolean {
    return sourceId.startsWith(SYSTEM_SOURCE_ID_PREFIX);
}

export function isSystemSourceUrn(urn: string): boolean {
    const parsed = parseUrn(urn);
    return parsed !== null && parsed.endpoint === null && isSystemSourceId(parsed.source);
}

export function systemSourceUrnOf(urn: string): string | null {
    const parsed = parseUrn(urn);
    if (!parsed || !isSystemSourceId(parsed.source)) return null;
    return makeSourceUrn(parsed.source);
}
