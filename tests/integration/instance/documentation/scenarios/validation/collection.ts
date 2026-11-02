import { expect } from "bun:test";
import { collectionSnapshot } from "../../../collections";
import type { Connection } from "../client";

export type Sources = { files: Array<{ path: string; content: string }> };

export function setSource(source: Sources, path: string, content: string) {
    const file = source.files.find((file) => file.path === path);
    expect(file).toBeDefined();
    file!.content = content;
}

export async function validationCollection(connection: Connection) {
    const { call } = connection;
    const namespace = "validation-journey";
    await call("ulvia.cms.repository", "claim-namespace", { namespace });
    const source = JSON.parse(collectionSnapshot(namespace)) as Sources;
    source.files.push(
        {
            path: "texts/definitions/content.json",
            content: JSON.stringify([{ id: "link", category: "bloc.label", group: "bloc.label", label: "bloc.label" }]),
        },
        { path: "texts/locales/en/content.json", content: JSON.stringify({ link: "Target" }) },
    );
    const panelPath = "blocs/mcp-kit-panel/definition.json";
    const definition = JSON.parse(source.files.find((file) => file.path === panelPath)!.content);
    definition.root.accepts = ["div", "main"];
    setSource(source, panelPath, JSON.stringify(definition));
    const markup =
        '<section><a href="/validation-target#destination">{{ cms.i18n.mcp-kit.link }}</a><slot name="body"></slot></section>';
    setSource(source, "blocs/mcp-kit-panel/markup.html", markup);
    for (const [suffix, html] of [
        ["clone", markup],
        ["reference", '<div id="label"></div><div aria-labelledby="label"></div><slot name="body"></slot>'],
        ["broken-reference", '<div aria-labelledby="missing"></div><slot name="body"></slot>'],
    ]) {
        const id = `mcp-kit-${suffix}`;
        const exampleId = `validation-${suffix}`;
        source.files.push(
            {
                path: `blocs/${id}/definition.json`,
                content: JSON.stringify({
                    ...definition,
                    id,
                    examples: [exampleId],
                    defaultExample: exampleId,
                    catalogue: "listed",
                }),
            },
            { path: `blocs/${id}/markup.html`, content: html! },
            {
                path: `examples/${exampleId}/definition.json`,
                content: JSON.stringify({
                    id: exampleId,
                    label: "bloc.label",
                    description: "bloc.label",
                    previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
                }),
            },
            { path: `examples/${exampleId}/document.html`, content: `<div cms-bloc="${id}"></div>` },
        );
    }
    const invalidSource = structuredClone(source);
    setSource(invalidSource, "blocs/mcp-kit-panel/markup.html", '<main><main><slot name="body"></slot></main></main>');
    const invalid = await call("ulvia.cms.repository", "prepare-collection", {
        sourceJson: JSON.stringify(invalidSource),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.preparationId).toBeUndefined();
    expect(invalid.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.main_nested", severity: "error" }),
    );
    const prepared = await call("ulvia.cms.repository", "prepare-collection", { sourceJson: JSON.stringify(source) });
    expect(prepared.valid).toBe(true);
    expect(prepared.diagnostics).toEqual([]);
    const duplicate = await call("ulvia.cms.repository", "prepare-collection", { sourceJson: JSON.stringify(source) });
    expect(duplicate.digest).toBe(prepared.digest);
    await call("ulvia.cms.repository", "discard-preparation", { preparationId: duplicate.preparationId });
    await call("ulvia.cms.repository", "publish-collection", {
        preparationId: prepared.preparationId,
        expectedDigest: prepared.digest,
    });
    const target = {
        repositoryId: prepared.repositoryId,
        publisherId: namespace,
        collectionId: prepared.collectionId,
        version: prepared.version,
        digest: prepared.digest,
        approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
    };
    const before = await call("ulvia.cms.installations", "list-collection-installations");
    await call("ulvia.cms.installations", "install-collection", {
        expectedRevision: before.revision,
        targets: [target],
    });
    return { source, target };
}
