import { createHash } from "node:crypto";
import { CaptureError, validateCapture } from "@bernouy/browser-capture";
import type { CaptureDocument, CaptureOptions } from "@bernouy/browser-capture";
import type { CaptureServices } from "./interfaces";
import type { CaptureMetadata, CaptureSource } from "./schemas";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import { ContentCapabilityError } from "content/application/core/capabilities/errors";

export function captureOwner(context: ContentCapabilityContext): string {
    // Admin access is checked by the capability boundary. Ordinary signed queries
    // carry a subject but omit actorKind; that claim is reserved for resource delivery.
    if (!context.subjectId || (context.actorKind !== undefined && context.actorKind !== "administrator")) {
        throw new ContentCapabilityError("NOT_FOUND");
    }
    return JSON.stringify([
        context.invocation?.instanceId ?? context.siteId,
        context.siteId,
        context.providerId,
        context.subjectId,
        context.connectionId ?? null,
    ]);
}
export async function createCapture(
    services: CaptureServices,
    document: CaptureDocument,
    options: CaptureOptions,
    source: CaptureSource,
    locale: string,
    context: ContentCapabilityContext,
): Promise<CaptureMetadata> {
    const owner = captureOwner(context);
    validateCapture(document, options);
    const digest = createHash("sha256");
    digest.update(
        JSON.stringify([document.origin ?? "https://capture.invalid", document.path, options, source, locale]),
    );
    for (const [path, blob] of [...document.files].sort(([a], [b]) => a.localeCompare(b))) {
        digest.update(JSON.stringify([path, blob.type, blob.size]));
        digest.update(new Uint8Array(await blob.arrayBuffer()));
    }
    const result = await services.engine.capture(document, options, context.signal);
    return {
        ...services.artifacts.put(owner, result.bytes),
        width: result.width,
        height: result.height,
        byteLength: result.bytes.byteLength,
        digest: `sha256:${createHash("sha256").update(result.bytes).digest("hex")}`,
        documentDigest: `sha256:${digest.digest("hex")}`,
        browserVersion: result.browserVersion,
        options,
        locale,
        source,
        diagnostics: [...result.diagnostics],
    };
}
export function captureFailure(cause: unknown): { code: string; output: { message: string } } | undefined {
    if (!(cause instanceof CaptureError)) {
        return undefined;
    }
    return {
        code: ["INVALID_INPUT", "LIMIT_EXCEEDED"].includes(cause.code) ? "INVALID_INPUT" : "CORE_UNAVAILABLE",
        output: { message: `Capture refused: ${cause.code}.` },
    };
}

export function captureLocale(value: string): string {
    try {
        const locale = Intl.getCanonicalLocales(value)[0];
        if (locale) {
            return locale;
        }
    } catch {
        throw new CaptureError("INVALID_INPUT");
    }
    throw new CaptureError("INVALID_INPUT");
}
