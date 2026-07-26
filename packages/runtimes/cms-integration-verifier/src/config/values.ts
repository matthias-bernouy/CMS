import { isAbsolute, resolve } from "node:path";
import { parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import {
    parsePinnedVerificationRunnerIdentity,
    type PinnedVerificationRunnerIdentity,
} from "@bernouy/cms-integration-verification";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ARGUMENT_DOCUMENT_LIMIT = 32_768;

export function repositoryOrigin(raw: string | undefined): string {
    if (!raw?.trim()) {
        throw new Error("CMS_INTEGRATION_VERIFIER_REPOSITORY_URL is required");
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("CMS_INTEGRATION_VERIFIER_REPOSITORY_URL must be an absolute HTTP URL");
    }
    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== "/" && url.pathname !== "")
    ) {
        throw new Error("CMS_INTEGRATION_VERIFIER_REPOSITORY_URL must be an HTTP origin without credentials");
    }
    return url.origin;
}

export function identifier(raw: string | undefined, name: string): string {
    const value = raw?.trim();
    if (!value || !IDENTIFIER.test(value)) {
        throw new Error(`${name} must be a stable identifier`);
    }
    return value;
}

export function absolutePath(raw: string | undefined, name: string, fallback?: string): string {
    const value = (raw ?? fallback)?.trim();
    if (!value || !isAbsolute(value)) {
        throw new Error(`${name} must be an absolute path`);
    }
    return resolve(value);
}

export function boundedInteger(
    raw: string | undefined,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^[0-9]+$/u.test(raw)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

export function sandboxArguments(raw: string | undefined): readonly string[] {
    if (raw === undefined) {
        return [];
    }
    let value: unknown;
    try {
        value = parseStrictJsonDocument(raw, ARGUMENT_DOCUMENT_LIMIT);
    } catch {
        throw new Error("CMS_INTEGRATION_VERIFIER_SANDBOX_ARGUMENTS_JSON must be strict bounded JSON");
    }
    if (
        !Array.isArray(value) ||
        value.length > 32 ||
        value.some((entry) => typeof entry !== "string" || entry.length > 4_096 || entry.includes("\0"))
    ) {
        throw new Error("CMS_INTEGRATION_VERIFIER_SANDBOX_ARGUMENTS_JSON must contain bounded string arguments");
    }
    return Object.freeze([...value]) as readonly string[];
}

export function runnerIdentity(source: Record<string, string | undefined>): PinnedVerificationRunnerIdentity {
    try {
        const identity = parsePinnedVerificationRunnerIdentity({
            name: source.CMS_INTEGRATION_VERIFIER_RUNNER_NAME,
            version: source.CMS_INTEGRATION_VERIFIER_RUNNER_VERSION,
            imageDigest: source.CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST,
        });
        const deployedImage = source.CMS_INTEGRATION_VERIFIER_DEPLOYED_IMAGE_REFERENCE;
        if (
            (source.NODE_ENV === "production" && deployedImage === undefined) ||
            (deployedImage !== undefined &&
                (!/^[^\s@]+@sha256:[a-f0-9]{64}$/u.test(deployedImage) ||
                    !deployedImage.endsWith(`@${identity.imageDigest}`)))
        ) {
            throw new TypeError();
        }
        return identity;
    } catch {
        throw new Error("Integration verifier runner identity must be exact and digest-pinned");
    }
}
