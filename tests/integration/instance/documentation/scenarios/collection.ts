import { expect } from "bun:test";
import { collectionSnapshot, exerciseContent } from "../../collections";
import { exerciseCollectionCatalogue } from "../../collection-catalogue";
import { invoke, refusal } from "./client";
import type { Connection } from "./client";

export async function collectionJourney(connection: Connection, cmsUrl: string, restart: () => Promise<void>) {
    const { call } = connection;
    const namespace = "documentation-exotic";
    const docs = await call("ulvia/cms.installations", "documentation.search", {
        query: "Préparer une collection, corriger les erreurs puis la publier et l'installer",
        contractId: "ulvia/cms.authoring",
    });
    const guide = docs.results.find(
        (item: { reference: { path: string } }) => item.reference.path === "collection-authoring.md",
    );
    expect(guide).toBeDefined();
    expect(
        (await call("ulvia/cms.installations", "documentation.get", { reference: guide.reference })).content,
    ).toContain("prepare-collection");
    await call("ulvia/cms.authoring", "claim-namespace", { namespace });
    const source = JSON.parse(collectionSnapshot(namespace));
    const invalid = await call("ulvia/cms.authoring", "prepare-collection", {
        sourceJson: JSON.stringify({ files: [...source.files, { path: "../escape.txt", content: "refuse" }] }),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics[0].message).toContain("path");
    expect(invalid.preparationId).toBeUndefined();
    const bytes = new TextEncoder().encode("Immutable collection asset — français 中文");
    const upload = await call("ulvia/cms.files", "workspace.upload.create", {
        filename: "notice.txt",
        size: bytes.byteLength,
        contentType: "text/plain",
        visibility: "private",
    });
    const headers = { Authorization: `Bearer ${connection.token.access_token}`, "Upload-Token": upload.uploadToken };
    expect((await fetch(upload.uploadUrl, { method: "PUT", headers, body: bytes })).status).toBe(204);
    await call("ulvia/cms.files", "workspace.upload.complete", { uploadId: upload.uploadId });
    const workspace = await call("ulvia/cms.files", "workspace.get");
    const file = workspace.items.find((item: { name: string }) => item.name === "notice.txt");
    expect(file).toBeDefined();
    source.assets = [{ path: "assets/notice.txt", fileId: file.fileId, generation: file.generation }];
    const example = source.files.find((item: { path: string }) => item.path === "examples/panel/document.html");
    example.content = example.content.replace(
        "Created through MCP",
        'Created through MCP <a href="{{ cms.asset.ulvia/mcp-kit.notice.txt }}">Download notice</a>',
    );
    const prepared = await call("ulvia/cms.authoring", "prepare-collection", { sourceJson: JSON.stringify(source) });
    expect(prepared.diagnostics).toEqual([]);
    expect(prepared.valid).toBe(true);
    await restart();
    const publication = { preparationId: prepared.preparationId, expectedDigest: prepared.digest };
    const published = await call("ulvia/cms.authoring", "publish-collection", publication);
    expect(published.digest).toBe(prepared.digest);
    expect(published.added).toBe(true);
    expect((await call("ulvia/cms.authoring", "publish-collection", publication)).added).toBe(false);
    await exerciseCollectionCatalogue(call, prepared.digest, false);
    const sources = await call("ulvia/cms.authoring", "get-collection-sources", {
        namespace,
        collectionId: "ulvia/mcp-kit",
        version: "1.0.0",
    });
    const retained = JSON.parse(sources.sourceJson);
    expect(retained.assets[0].releaseDigest).toBe(prepared.digest);
    expect(retained.assets[0].fileId).toBeUndefined();
    const reproduced = await call("ulvia/cms.authoring", "prepare-collection", { sourceJson: sources.sourceJson });
    expect(reproduced.digest).toBe(prepared.digest);
    const current = await call("ulvia/cms.installations", "list-collection-installations");
    const target = {
        repositoryId: prepared.repositoryId,
        publisherId: namespace,
        collectionId: "ulvia/mcp-kit",
        version: "1.0.0",
        digest: prepared.digest,
        approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
    };
    refusal(
        await invoke(connection, "ulvia/cms.installations", "install-collection", {
            expectedRevision: current.revision,
            targets: [{ ...target, approvedBrowserRiskDigest: `sha256:${"0".repeat(64)}` }],
        }),
        "BROWSER_CAPABILITIES_APPROVAL_REQUIRED",
    );
    expect(await call("ulvia/cms.installations", "list-collection-installations")).toEqual(current);
    const installed = await call("ulvia/cms.installations", "install-collection", {
        expectedRevision: current.revision,
        targets: [target],
    });
    refusal(
        await invoke(connection, "ulvia/cms.installations", "install-collection", {
            expectedRevision: current.revision,
            targets: [target],
        }),
        "REVISION_CONFLICT",
    );
    expect(await call("ulvia/cms.installations", "list-collection-installations")).toEqual(installed);
    await exerciseCollectionCatalogue(call, prepared.digest, true);
    await exerciseContent(call, cmsUrl);
    const page = await connection.browser.newPage();
    try {
        await page.goto(`${cmsUrl}/mcp-regression`);
        const href = await page.getByRole("link", { name: "Download notice" }).getAttribute("href");
        expect(href).toBeString();
        const asset = await fetch(new URL(href!, cmsUrl));
        expect(asset.status).toBe(200);
        expect(await asset.text()).toBe(new TextDecoder().decode(bytes));
    } finally {
        await page.close();
    }
    await restart();
    expect(await call("ulvia/cms.installations", "list-collection-installations")).toEqual(installed);
    expect((await fetch(`${cmsUrl}/mcp-regression`)).status).toBe(200);
    await call("ulvia/cms.authoring", "discard-preparation", { preparationId: reproduced.preparationId });
    await call("ulvia/cms.authoring", "discard-preparation", { preparationId: prepared.preparationId });
}
