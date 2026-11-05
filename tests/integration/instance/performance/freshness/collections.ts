import { expect } from "bun:test";
import { resourceRuntimeNamespace } from "@bernouy/cms-repository/contracts/protocol";
import { cachedPage, publishPage, type Connection } from "./context";
function source(namespace: string): string {
    const collectionId = `${namespace}/cache-kit`;
    const blocId = `${resourceRuntimeNamespace(collectionId)}--media-host`;
    const files = [
        {
            path: "definition.json",
            content: JSON.stringify({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId: namespace,
                collectionId,
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
            path: `blocs/${blocId}/definition.json`,
            content: JSON.stringify({
                kind: "component",
                id: blocId,
                label: "host",
                description: "host",
                categories: ["host"],
                examples: ["media"],
                defaultExample: "media",
                root: { accepts: ["div"] },
                slots: { "": { accepts: [{ kind: "native-element", accepts: ["img"] }] } },
                uses: [],
                requires: [{ contractId: "ulvia/cms.files", capabilityId: "files.read", versionRange: "^1.0.0" }],
            }),
        },
        { path: `blocs/${blocId}/markup.html`, content: "<slot></slot>" },
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
            content: `<div cms-bloc="${blocId}"><img src="/.cms/call/ulvia/cms.files/files/example/generation" alt="Media example"></div>`,
        },
    ];
    return JSON.stringify({ files });
}
export async function exerciseCollectionFreshness(connection: Connection, cmsUrl: string, namespace: string) {
    const collectionId = `${namespace}/cache-kit`;
    const call = (capability: string, input: Record<string, unknown> = {}) =>
        connection.call("ulvia/cms.installations", capability, input);
    await publishPage(
        connection,
        "/cache-collection",
        '<h1 cms-bloc="ulvia--mossa--heading" size="lg" text-align="start">Collections</h1>',
    );
    const page = cachedPage(cmsUrl, "/cache-collection");
    const initial = await page.warm();
    await connection.call("ulvia/cms.authoring", "claim-namespace", { namespace });
    // Repository authoring itself is neutral for installed rendering state.
    const prepared = await connection.call("ulvia/cms.authoring", "prepare-collection", {
        sourceJson: source(namespace),
    });
    expect(prepared.valid, JSON.stringify(prepared)).toBe(true);
    await connection.call("ulvia/cms.authoring", "publish-collection", {
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
                collectionId,
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
        collectionId,
        expectedRevision: installed.revision,
        configurationJson: JSON.stringify({ label: "Changed" }),
    });
    const configured = await page.read("MISS");
    expect(configured.status).toBe(200);
    expect(configured.text).not.toBe(after.text);
    const state = await call("get-collection-installation", { collectionId });
    expect(JSON.parse(state.configurationJson)).toEqual({ label: "Changed" });
    await expect(
        call("update-collection-configuration", {
            collectionId,
            expectedRevision: state.revision,
            configurationJson: '{"label":42}',
        }),
    ).rejects.toThrow();
    const unchanged = await call("get-collection-installation", { collectionId });
    expect(unchanged.configurationJson).toBe(state.configurationJson);
    expect(unchanged.revision).toBe(state.revision);
    return { installImmediate: true, configurationImmediate: true, invalidConfigurationUnchanged: true };
}
