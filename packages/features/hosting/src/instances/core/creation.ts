import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreateProviderInstance } from "./lifecycle";
import type { InstanceCreationAuthority } from "hosting/instances/interfaces/types";
import { assertInstanceCreationAuthority } from "./creationAuthority";

export function prepareInstanceCreation(
    key: string,
    input: CreateProviderInstance,
    secret: string,
    authority: InstanceCreationAuthority,
) {
    validateCreateInput(key, input);
    assertInstanceCreationAuthority(authority);
    const creationAuthority: InstanceCreationAuthority =
        authority.kind === "operator"
            ? { kind: "operator" }
            : {
                  kind: "control",
                  actor: { instanceId: authority.actor.instanceId, subjectId: authority.actor.subjectId },
              };
    const digest = createHmac("sha256", secret).update(`ulvia-instance/v1:${key}`).digest();
    digest[6] = (digest[6]! & 15) | 128;
    digest[8] = (digest[8]! & 63) | 128;
    const hex = digest.subarray(0, 16).toString("hex");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const normalized = {
        label: input.label.trim(),
        cmsUrl: new URL(input.cmsUrl).origin,
        gatewayUrl: new URL(input.gatewayUrl ?? input.cmsUrl).origin,
    };
    const idempotencyFingerprint = createHmac("sha256", secret)
        .update(JSON.stringify({ ...normalized, administrator: input.administrator, creationAuthority }))
        .digest("base64url");
    return {
        ...normalized,
        id: `instance:${uuid}`,
        storageKey: `instance-${uuid}`,
        idempotencyKey: key,
        idempotencyFingerprint,
        creationAuthority,
    };
}

export function assertMatchingFingerprint(expected: string, actual: string): void {
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
        throw new TypeError("Idempotency key was already used with a different request");
    }
}

function validateCreateInput(idempotencyKey: string, input: CreateProviderInstance): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(idempotencyKey)) {
        throw new TypeError("Idempotency key is invalid");
    }
    const label = input.label.trim();
    if (!label || label.length > 80 || /[\x00-\x1f\x7f]/u.test(label)) {
        throw new TypeError("Instance label is invalid");
    }
    for (const value of [input.cmsUrl, input.gatewayUrl ?? input.cmsUrl]) {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new TypeError("Edge URL is invalid");
        }
        if (
            value.length > 2048 ||
            !/^https?:$/u.test(url.protocol) ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            throw new TypeError("Edge URL is invalid");
        }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.administrator.email) || input.administrator.email.length > 254) {
        throw new TypeError("Administrator email is invalid");
    }
    if (input.administrator.password.length < 12 || input.administrator.password.length > 1_024) {
        throw new TypeError("Administrator password is invalid");
    }
}
