import { describe, expect, test } from "bun:test";
import {
    INTEGRATION_PACKAGE_DIGEST_HEADER,
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageSource,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "cms-repository/RepositoryCms";
import { json, TestRunner } from "./testRunner";

describe("@bernouy/cms-repository exact package routes", () => {
    test("serves canonical package bytes with immutable digest metadata", async () => {
        const document = await packageDocument();
        const runner = mounted(packageSource(document));
        const path = "/api/integrations/package?kind=demo&version=1.0.0";

        const get = await runner.handle(path);
        const head = await runner.handle(path, { method: "HEAD" });
        const notModified = await runner.handle(path, {
            headers: { "if-none-match": `W/\"${document.digest}\"` },
        });

        expect(new Uint8Array(await get.arrayBuffer())).toEqual(document.canonicalBytes);
        expect(get.headers.get("etag")).toBe(`"${document.digest}"`);
        expect(get.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER)).toBe(document.digest);
        expect(get.headers.get("content-length")).toBe(String(document.canonicalBytes.byteLength));
        expect(get.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(get.headers.get("access-control-allow-origin")).toBe("*");
        expect(get.headers.get("access-control-expose-headers")).toContain(INTEGRATION_PACKAGE_DIGEST_HEADER);
        expect(head.status).toBe(200);
        expect(head.headers.get("etag")).toBe(`"${document.digest}"`);
        expect(head.headers.get("content-length")).toBe(String(document.canonicalBytes.byteLength));
        expect(await head.text()).toBe("");
        expect(notModified.status).toBe(304);
        expect(notModified.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER)).toBe(document.digest);
    });

    test("serves exact UTF-8 release notes and returns 404 for legacy packages", async () => {
        const document = await packageDocument();
        const runner = mounted(packageSource(document));
        const path = "/api/integrations/release-notes?kind=demo&version=1.0.0";

        const notes = await runner.handle(path);
        const head = await runner.handle(path, { method: "HEAD" });

        expect(notes.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
        expect(notes.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(await notes.text()).toBe("## Changes\n\nInitial release.\n");
        expect(await head.text()).toBe("");

        const legacy = await packageDocument(false);
        const missing = await mounted(packageSource(legacy)).handle(path);
        expect(missing.status).toBe(404);
        expect(await json(missing)).toEqual({ error: "integration release notes not found" });
    });

    test("rejects missing or invalid identities before consulting the source", async () => {
        const calls: string[] = [];
        const runner = mounted(packageSource(null, calls));

        const missing = await runner.handle("/api/integrations/package?kind=demo");
        const invalid = await runner.handle("/api/integrations/package?kind=demo&version=latest");
        const absent = await runner.handle("/api/integrations/package?kind=demo&version=1.0.0");

        expect(missing.status).toBe(400);
        expect(invalid.status).toBe(400);
        expect(await json(invalid)).toMatchObject({ code: "invalid_version" });
        expect(absent.status).toBe(404);
        expect(calls).toEqual(["demo@1.0.0"]);
    });

    test("fails closed when a source violates exact identity", async () => {
        const document = await packageDocument();
        const mismatched = { ...document, envelope: { ...document.envelope, version: "2.0.0" as const } };
        const response = await mounted(packageSource(mismatched)).handle(
            "/api/integrations/package?kind=demo&version=1.0.0",
        );

        expect(response.status).toBe(500);
        expect(await json(response)).toMatchObject({ code: "integration_package_source_invalid" });
    });
});

function mounted(integrationPackages: IntegrationPackageSource): TestRunner {
    const runner = new TestRunner();
    new RepositoryCms({ runner, integrationCatalog: emptyCatalog(), integrationPackages });
    return runner;
}

function packageSource(document: ResolvedIntegrationPackage | null, calls: string[] = []): IntegrationPackageSource {
    return {
        getPackage: async (kind, version) => {
            calls.push(`${kind}@${version}`);
            return document;
        },
    };
}

async function packageDocument(withNotes = true): Promise<ResolvedIntegrationPackage> {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        ...(withNotes ? { releaseNotes: "release-notes.md" } : {}),
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            ...(withNotes
                ? { "release-notes.md": { encoding: "utf8" as const, content: "## Changes\n\nInitial release.\n" } }
                : {}),
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

function emptyCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [],
        getIndex: async () => null,
        listVersions: async () => [],
        get: async () => null,
    };
}
