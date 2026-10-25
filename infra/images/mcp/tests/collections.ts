import { expect } from "bun:test";
import { docker } from "./containers";

type Call = (contract: string, capability: string, input?: Record<string, unknown>) => Promise<any>;

function snapshot(namespace: string, macroMarker?: string) {
    const files = [
        {
            path: "definition.json",
            content: JSON.stringify({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId: namespace,
                collectionId: "mcp-kit",
                version: "1.0.0",
                name: "collection.name",
                locale: "en",
            }),
        },
        {
            path: "translations/en/base.json",
            content: JSON.stringify({ "collection.name": "MCP kit", "bloc.label": "Panel" }),
        },
        {
            path: "blocs/mcp-kit-panel/definition.json",
            content: JSON.stringify({
                kind: "component",
                id: "mcp-kit-panel",
                label: "bloc.label",
                root: { accepts: ["div"] },
                slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
                uses: [],
                requires: [],
            }),
        },
        { path: "blocs/mcp-kit-panel/markup.html", content: '<section><slot name="body"></slot></section>' },
    ];
    if (macroMarker) {
        files.push({
            path: "blocs/mcp-kit-panel/bloc.ts",
            content:
                'import { compute } from "./runtime/macro.ts" with { type: "macro" }; const value = compute(); export function mount(root: HTMLElement) { root.dataset.value = String(value); }',
        });
        files.push({
            path: "blocs/mcp-kit-panel/runtime/macro.ts",
            content: `export async function compute() { await Bun.write(${JSON.stringify(macroMarker)}, "unexpected"); return "macro"; }`,
        });
    }
    return JSON.stringify({ files });
}

export async function exerciseCollections(call: Call, namespace: string, providerName: string) {
    const identity = await call("ulvia.cms.repository", "get-identity");
    expect(identity.publicKey).toBeString();
    await call("ulvia.cms.repository", "claim-namespace", { namespace });
    const marker = `/tmp/${namespace}-macro-must-not-run`;
    const rejected = await call("ulvia.cms.repository", "prepare-collection", {
        sourceJson: snapshot(namespace, marker),
    });
    expect(rejected.valid).toBe(false);
    expect((await docker(["exec", providerName, "test", "-e", marker], true)).code).not.toBe(0);
    const prepared = await call("ulvia.cms.repository", "prepare-collection", { sourceJson: snapshot(namespace) });
    expect(prepared.valid).toBe(true);
    const published = await call("ulvia.cms.repository", "publish-collection", {
        preparationId: prepared.preparationId,
        expectedDigest: prepared.digest,
    });
    expect(published.digest).toBe(prepared.digest);
    const current = await call("ulvia.cms.installations", "list-collection-installations");
    const installed = await call("ulvia.cms.installations", "install-collection", {
        expectedRevision: current.revision,
        targets: [
            {
                repositoryId: prepared.repositoryId,
                publisherId: namespace,
                collectionId: prepared.collectionId,
                version: prepared.version,
                digest: prepared.digest,
                approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
            },
        ],
    });
    expect(installed.items.some((item: { collectionId: string }) => item.collectionId === "mcp-kit")).toBe(true);
    const sources = await call("ulvia.cms.repository", "get-collection-sources", {
        namespace,
        collectionId: "mcp-kit",
        version: "1.0.0",
    });
    expect(sources.releaseDigest).toBe(prepared.digest);
    return identity.publicKey as string;
}

export async function exerciseContent(call: Call, kernelUrl: string) {
    const page = await call("ulvia.cms.content", "pages.create", {
        path: "/mcp-regression",
        title: "MCP regression",
        content: '<div cms-bloc="mcp-kit-panel"><p slot="body">Created through MCP</p></div>',
    });
    await call("ulvia.cms.content", "pages.publish", { id: page.id, expectedRevision: page.revision, visible: true });
    const response = await fetch(`${kernelUrl}/mcp-regression`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Created through MCP");
}

export async function exerciseFiles(call: Call, kernelUrl: string, accessToken: string) {
    const bytes = new TextEncoder().encode("Local MCP file upload");
    const upload = await call("ulvia.cms.files", "workspace.upload.create", {
        filename: "mcp.txt",
        size: bytes.byteLength,
        contentType: "text/plain",
        visibility: "private",
    });
    expect(upload.uploadUrl.startsWith(`${kernelUrl}/.cms/mcp/uploads/`)).toBe(true);
    expect(
        (
            await fetch(upload.uploadUrl, {
                method: "PUT",
                headers: { Authorization: `Bearer ${accessToken}`, "Upload-Token": upload.uploadToken },
                body: bytes,
            })
        ).status,
    ).toBe(204);
    await call("ulvia.cms.files", "workspace.upload.complete", { uploadId: upload.uploadId });
    const workspace = await call("ulvia.cms.files", "workspace.get");
    const file = workspace.items.find((item: { name: string }) => item.name === "mcp.txt");
    expect(file).toBeDefined();
    const signed = await call("ulvia.cms.files", "workspace.files.sign", {
        fileId: file.fileId,
        generation: file.generation,
        expiresIn: 60,
    });
    const downloaded = await fetch(signed.url);
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe("Local MCP file upload");
}
