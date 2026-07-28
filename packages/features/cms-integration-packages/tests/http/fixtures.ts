import { expect } from "bun:test";
import {
    INTEGRATION_PACKAGE_DIGEST_HEADER,
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";

export type HttpPackageFixture = {
    envelope: IntegrationPackageEnvelopeV1;
    bytes: Uint8Array;
    digest: string;
};

export async function httpPackageFixture(
    overrides: Partial<Pick<IntegrationPackageEnvelopeV1, "kind" | "version">> = {},
): Promise<HttpPackageFixture> {
    const kind = overrides.kind ?? "commerce";
    const version = overrides.version ?? "1.2.3";
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify({ kind, version }) },
            "release-notes.md": { encoding: "utf8", content: "## Changes\n\nCompatible update.\n" },
        },
    };
    const bytes = canonicalJsonBytes(envelope);
    return { envelope, bytes, digest: await sha256Hex(bytes) };
}

export function packageHeaders(fixture: HttpPackageFixture, overrides: Record<string, string> = {}): Headers {
    return new Headers({
        "content-length": String(fixture.bytes.byteLength),
        "content-type": "application/json; charset=utf-8",
        [INTEGRATION_PACKAGE_DIGEST_HEADER]: fixture.digest,
        ...overrides,
    });
}

export function packageHead(fixture: HttpPackageFixture, overrides: Record<string, string> = {}): Response {
    return new Response(null, { headers: packageHeaders(fixture, overrides) });
}

export function packageGet(
    fixture: HttpPackageFixture,
    options: { body?: BodyInit; headers?: Record<string, string>; status?: number } = {},
): Response {
    return new Response(options.body ?? fixture.bytes, {
        status: options.status,
        headers: packageHeaders(fixture, options.headers),
    });
}

export function assertRepositoryError(error: unknown, status: 502 | 503, publicCode: string): void {
    expect(error).toMatchObject({ status, publicCode });
}
