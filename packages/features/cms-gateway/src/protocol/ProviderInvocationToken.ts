import { isTraceContext, type TraceContext } from "@bernouy/logging";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isCanonicalSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";

const TOKEN_VERSION = 1;
const MAX_TOKEN_BYTES = 4_096;
const MAX_TTL_SECONDS = 30;
const CLOCK_SKEW_SECONDS = 5;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SUBJECT_ID = /^[\x20-\x7e]{1,256}$/u;

export interface ProviderInvocationIssue {
    readonly trace?: TraceContext;
    readonly actorKind?: "anonymous" | "user" | "administrator";
    readonly requestId: string;
    readonly installationId: string;
    readonly contractId: string;
    readonly contractVersion: string;
    readonly capabilityId: string;
    readonly subjectId?: string;
    readonly systemServiceId?: string;
    readonly sourceInstallationId?: string;
    readonly sourceCredentialFingerprint?: string;
    readonly delegatedTicket?: string;
    readonly delegation?: DelegationContext;
    readonly bodyBytes?: number;
}

export type ProviderInvocationClaims = Readonly<{
    trace?: TraceContext;
    actorKind?: "anonymous" | "user" | "administrator";
    version: 1;
    requestId: string;
    instanceId: string;
    contractId: string;
    contractVersion: string;
    capabilityId: string;
    subjectId?: string;
    systemServiceId?: string;
    sourceInstallationId?: string;
    rootRequestId?: string;
    delegationTicket?: string;
    delegationExpiresAt?: number;
    connectionId?: string;
    issuedAt: number;
    expiresAt: number;
}>;

type ProviderInvocationHeader = Readonly<{
    version: 1;
    keyId: string;
}>;

export function providerInvocationKeyId(secret: string): string {
    assertProviderInvocationSecret(secret);
    return createHash("sha256").update(secret, "utf8").digest("base64url").slice(0, 22);
}

export function signProviderInvocationToken(secret: string, claims: ProviderInvocationClaims): string {
    const claimKeys = [
        "capabilityId",
        "contractId",
        "contractVersion",
        "expiresAt",
        "instanceId",
        "issuedAt",
        "requestId",
        "version",
    ];
    assertExactObject(claims as unknown as Record<string, unknown>, [
        ...claimKeys,
        ...(claims.trace ? ["trace"] : []),
        ...(claims.actorKind ? ["actorKind"] : []),
        ...(claims.subjectId ? ["subjectId"] : []),
        ...(claims.systemServiceId ? ["systemServiceId"] : []),
        ...(claims.sourceInstallationId ? ["sourceInstallationId"] : []),
        ...(claims.rootRequestId ? ["rootRequestId"] : []),
        ...(claims.delegationTicket ? ["delegationTicket", "delegationExpiresAt"] : []),
        ...(claims.connectionId ? ["connectionId"] : []),
    ]);
    assertClaims(claims);
    const header: ProviderInvocationHeader = { version: TOKEN_VERSION, keyId: providerInvocationKeyId(secret) };
    const encodedHeader = encodeJson(header);
    const encodedClaims = encodeJson(claims);
    const signed = `${encodedHeader}.${encodedClaims}`;
    const signature = createHmac("sha256", secret).update(domainSeparated(signed)).digest("base64url");
    return `${signed}.${signature}`;
}

export function verifyProviderInvocationToken(
    token: string,
    secret: string,
    nowSeconds = Math.floor(Date.now() / 1_000),
): ProviderInvocationClaims {
    if (!Number.isSafeInteger(nowSeconds)) {
        throw new TypeError("Provider invocation token is invalid.");
    }
    const [encodedHeader, encodedClaims, encodedSignature] = tokenParts(token);
    const header = parseHeader(encodedHeader);
    if (header.keyId !== providerInvocationKeyId(secret)) {
        throw new TypeError("Provider invocation token key is invalid.");
    }
    const expected = createHmac("sha256", secret)
        .update(domainSeparated(`${encodedHeader}.${encodedClaims}`))
        .digest();
    const received = decodeBase64Url(encodedSignature, 32);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw new TypeError("Provider invocation token signature is invalid.");
    }
    const claims = parseClaims(encodedClaims);
    if (!providerInvocationIsCurrent(claims, nowSeconds)) {
        throw new TypeError("Provider invocation token has expired.");
    }
    return Object.freeze(claims);
}

/** Recheck a verified lease after asynchronous setup without rereading keys or authority. */
export function providerInvocationIsCurrent(
    claims: ProviderInvocationClaims,
    nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
    return (
        Number.isSafeInteger(nowSeconds) &&
        claims.issuedAt <= nowSeconds + CLOCK_SKEW_SECONDS &&
        claims.expiresAt >= nowSeconds - CLOCK_SKEW_SECONDS
    );
}

/** Reads only the bounded, untrusted key selector. Verification must still follow before using any claim. */
export function readProviderInvocationKeyId(token: string): string {
    return parseHeader(tokenParts(token)[0]).keyId;
}

export function assertProviderInvocationSecret(secret: string): void {
    assertProviderConnectionToken(secret);
}

function parseHeader(value: string): ProviderInvocationHeader {
    const parsed = parseJsonSegment(value);
    assertExactObject(parsed, ["keyId", "version"]);
    if (
        parsed.version !== TOKEN_VERSION ||
        typeof parsed.keyId !== "string" ||
        !/^[A-Za-z0-9_-]{22}$/u.test(parsed.keyId)
    ) {
        throw new TypeError("Provider invocation token header is invalid.");
    }
    return { version: TOKEN_VERSION, keyId: parsed.keyId };
}

function parseClaims(value: string): ProviderInvocationClaims {
    const parsed = parseJsonSegment(value);
    const keys = [
        "capabilityId",
        "contractId",
        "contractVersion",
        "expiresAt",
        "instanceId",
        "issuedAt",
        "requestId",
        "version",
    ];
    assertExactObject(parsed, [
        ...keys,
        ...(Object.hasOwn(parsed, "trace") ? ["trace"] : []),
        ...(Object.hasOwn(parsed, "actorKind") ? ["actorKind"] : []),
        ...(Object.hasOwn(parsed, "subjectId") ? ["subjectId"] : []),
        ...(Object.hasOwn(parsed, "systemServiceId") ? ["systemServiceId"] : []),
        ...(Object.hasOwn(parsed, "sourceInstallationId") ? ["sourceInstallationId"] : []),
        ...(Object.hasOwn(parsed, "rootRequestId") ? ["rootRequestId"] : []),
        ...(Object.hasOwn(parsed, "delegationTicket") ? ["delegationTicket", "delegationExpiresAt"] : []),
        ...(Object.hasOwn(parsed, "connectionId") ? ["connectionId"] : []),
    ]);
    const claims = parsed as Record<string, unknown>;
    assertClaims(claims);
    return claims as ProviderInvocationClaims;
}

function assertClaims(value: Readonly<Record<string, unknown>>): asserts value is ProviderInvocationClaims {
    if (
        (value.actorKind !== undefined &&
            (!["anonymous", "user", "administrator"].includes(String(value.actorKind)) ||
                (value.actorKind === "anonymous") !== (value.subjectId === undefined) ||
                value.systemServiceId !== undefined ||
                (value.sourceInstallationId !== undefined && value.rootRequestId === undefined))) ||
        (value.trace !== undefined && (!isTraceContext(value.trace) || value.trace.spanId !== value.requestId)) ||
        value.version !== TOKEN_VERSION ||
        typeof value.requestId !== "string" ||
        !REQUEST_ID.test(value.requestId) ||
        typeof value.instanceId !== "string" ||
        !IDENTIFIER.test(value.instanceId) ||
        typeof value.contractId !== "string" ||
        !IDENTIFIER.test(value.contractId) ||
        typeof value.contractVersion !== "string" ||
        !isCanonicalSemVer(value.contractVersion) ||
        typeof value.capabilityId !== "string" ||
        !IDENTIFIER.test(value.capabilityId) ||
        (value.subjectId !== undefined && (typeof value.subjectId !== "string" || !SUBJECT_ID.test(value.subjectId))) ||
        (value.systemServiceId !== undefined &&
            (typeof value.systemServiceId !== "string" ||
                !IDENTIFIER.test(value.systemServiceId) ||
                value.subjectId !== undefined)) ||
        (value.sourceInstallationId !== undefined &&
            (typeof value.sourceInstallationId !== "string" ||
                !IDENTIFIER.test(value.sourceInstallationId) ||
                (value.subjectId !== undefined && value.rootRequestId === undefined) ||
                value.systemServiceId !== undefined)) ||
        (value.rootRequestId !== undefined &&
            (typeof value.rootRequestId !== "string" ||
                !REQUEST_ID.test(value.rootRequestId) ||
                value.sourceInstallationId === undefined ||
                value.delegationTicket !== undefined)) ||
        (value.delegationTicket !== undefined &&
            (typeof value.delegationTicket !== "string" ||
                !/^[A-Za-z0-9_-]{43}$/u.test(value.delegationTicket) ||
                !Number.isSafeInteger(value.delegationExpiresAt) ||
                Number(value.delegationExpiresAt) <= Number(value.issuedAt) * 1000 ||
                Number(value.delegationExpiresAt) > Number(value.expiresAt) * 1000 ||
                value.systemServiceId !== undefined ||
                value.sourceInstallationId !== undefined)) ||
        (value.connectionId !== undefined &&
            (typeof value.connectionId !== "string" || !IDENTIFIER.test(value.connectionId))) ||
        !Number.isSafeInteger(value.issuedAt) ||
        !Number.isSafeInteger(value.expiresAt) ||
        Number(value.issuedAt) < 0 ||
        Number(value.expiresAt) <= Number(value.issuedAt) ||
        Number(value.expiresAt) - Number(value.issuedAt) > MAX_TTL_SECONDS
    ) {
        throw new TypeError("Provider invocation token claims are invalid.");
    }
}

function parseJsonSegment(value: string): Record<string, unknown> {
    const bytes = decodeBase64Url(value, 2_048);
    const parsed = parseStrictJson(bytes, 2_048, 4);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Provider invocation token JSON is invalid.");
    }
    return parsed as Record<string, unknown>;
}

function assertExactObject(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
        throw new TypeError("Provider invocation token fields are invalid.");
    }
}

function encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64Url(value: string, maximum: number): Buffer {
    if (!value || value.length > maximum * 2 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
        throw new TypeError("Provider invocation token encoding is invalid.");
    }
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length > maximum || decoded.toString("base64url") !== value) {
        throw new TypeError("Provider invocation token encoding is invalid.");
    }
    return decoded;
}

function domainSeparated(value: string): string {
    return `ulvia-provider-invocation-v1\0${value}`;
}

function tokenParts(token: string): [string, string, string] {
    if (token.length > MAX_TOKEN_BYTES || !/^[A-Za-z0-9._-]+$/u.test(token)) {
        throw new TypeError("Provider invocation token is invalid.");
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new TypeError("Provider invocation token is invalid.");
    }
    return parts as [string, string, string];
}
