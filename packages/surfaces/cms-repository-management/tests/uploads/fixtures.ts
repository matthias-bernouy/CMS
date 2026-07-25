import {
    canonicalJsonBytes,
    INTEGRATION_PACKAGE_SCHEMA,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";

export const utf8 = new TextEncoder();

export function validEnvelope(): IntegrationPackageEnvelopeV1 {
    return {
        schema: INTEGRATION_PACKAGE_SCHEMA,
        kind: "demo",
        version: "1.2.3",
        definition: "integration.json",
        releaseNotes: "release-notes.md",
        files: {
            "integration.json": {
                encoding: "utf8",
                content: '{"kind":"demo","version":"1.2.3"}',
            },
            "release-notes.md": {
                encoding: "utf8",
                content: "## Changes\n\nA compatible release.",
            },
            "assets/icon.bin": { encoding: "base64", content: "AAECAw==" },
        },
    };
}

export function uploadRequest(
    body: ReadableStream<Uint8Array> | null,
    headers: HeadersInit = { "content-type": "application/json" },
): Request {
    return { body, headers: new Headers(headers) } as Request;
}

export function byteBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

export function canonicalDocument(): Uint8Array {
    return canonicalJsonBytes(validEnvelope());
}
