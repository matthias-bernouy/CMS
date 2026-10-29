import { expect } from "bun:test";
import { cachedPage, publishPage, type Connection } from "./context";
function source(namespace: string): string {
    const files = [
        {
            path: "definition.json",
            content: JSON.stringify({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId: namespace,
                collectionId: "cache-kit",
                version: "1.0.0",
                name: "name",
                locale: "en",
                configuration: {
                    schema: {
                        type: "object",
                        properties: { label: { type: "string", maxLength: 128 } },
                        required: ["label"],
                    },
                    defaults: { label: "Initial" },
                },
            }),
        },
        { path: "translations/en/base.json", content: JSON.stringify({ name: "Cache kit", host: "Media host" }) },
        {
            path: "blocs/cache-kit-media-host/definition.json",
            content: JSON.stringify({
                kind: "component",
                id: "cache-kit-media-host",
                label: "host",
                description: "host",
                categories: ["host"],
                examples: ["media"],
                defaultExample: "media",
                root: { accepts: ["div"] },
                slots: { "": { accepts: [{ kind: "native-element", accepts: ["img"] }] } },
                uses: [],
                requires: [{ contractId: "ulvia.cms.files", capabilityId: "files.read", versionRange: "^1.0.0" }],
            }),
        },
        { path: "blocs/cache-kit-media-host/markup.html", content: "<slot></slot>" },
        {
            path: "examples/media/definition.json",
            content: JSON.stringify({
                id: "media",
                label: "host",
                description: "host",
                previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
            }),
        },
        {
            path: "examples/media/document.html",
            content:
                '<div cms-bloc="cache-kit-media-host"><img src="/.cms/call/ulvia.cms.files/files/example/generation" alt="Media example"></div>',
        },
    ];
    return JSON.stringify({ files });
}
export async function exerciseCollectionFreshness(connection: Connection, cmsUrl: string, namespace: string) {
    const call = (capability: string, input: Record<string, unknown> = {}) =>
        connection.call("ulvia.cms.installations", capability, input);
    await publishPage(
        connection,
        "/cache-collection",
        '<h1 cms-bloc="ulvia-official-heading" size="lg" text-align="start">Collections</h1>',
    );
    const page = cachedPage(cmsUrl, "/cache-collection");
    const initial = await page.warm();
    await connection.call("ulvia.cms.repository", "claim-namespace", { namespace });
    // Repository authoring itself is neutral for installed rendering state.
    const prepared = await connection.call("ulvia.cms.repository", "prepare-collection", {
        sourceJson: source(namespace),
    });
    expect(prepared.valid, JSON.stringify(prepared)).toBe(true);
    await connection.call("ulvia.cms.repository", "publish-collection", {
        preparationId: prepared.preparationId,
        expectedDigest: prepared.digest,
    });
    expect((await page.warm()).text).toBe(initial.text);
    const current = await call("list-collection-installations");
    const installed = await call("install-collection", {
        expectedRevision: current.revision,
        targets: [
            {
                repositoryId: prepared.repositoryId,
                publisherId: namespace,
                collectionId: "cache-kit",
                version: prepared.version,
                digest: prepared.digest,
                approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
            },
        ],
    });
    const after = await page.read("MISS");
    expect(after.status).toBe(200);
    expect(after.text).not.toBe(initial.text);
    await page.read("HIT");
    await call("update-collection-configuration", {
        collectionId: "cache-kit",
        expectedRevision: installed.revision,
        configurationJson: JSON.stringify({ label: "Changed" }),
    });
    const configured = await page.read("MISS");
    expect(configured.status).toBe(200);
    expect(configured.text).not.toBe(after.text);
    const state = await call("get-collection-installation", { collectionId: "cache-kit" });
    expect(JSON.parse(state.configurationJson)).toEqual({ label: "Changed" });
    await expect(
        call("update-collection-configuration", {
            collectionId: "cache-kit",
            expectedRevision: state.revision,
            configurationJson: '{"label":42}',
        }),
    ).rejects.toThrow();
    const unchanged = await call("get-collection-installation", { collectionId: "cache-kit" });
    expect(unchanged.configurationJson).toBe(state.configurationJson);
    expect(unchanged.revision).toBe(state.revision);
    return { installImmediate: true, configurationImmediate: true, invalidConfigurationUnchanged: true };
}
