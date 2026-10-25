import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validatePageDocument } from "@bernouy/cms-content/page-document";
import { buildOfficialBootstrapArtifacts, writeOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";
import { officialContractCatalogue } from "../officialContractCatalogue";

test("the official collection passes its source quality contract", async () => {
    const source = resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official");
    const artifact = await prepareCollectionRelease(source, await officialContractCatalogue());
    const visible = artifact.release.blocs.filter((bloc) => bloc.catalogue !== "hidden");
    expect(visible.every((bloc) => bloc.category !== undefined && bloc.order !== undefined)).toBeTrue();
    expect(new Set(visible.map((bloc) => `${bloc.category}:${bloc.order}`)).size).toBe(visible.length);
    expect(
        visible.every((bloc) => Object.values(bloc.slots).every((slot) => (slot.accepts?.length ?? 0) > 0)),
    ).toBeTrue();
    expect(
        visible.filter((bloc) => bloc.kind === "component").every((bloc) => bloc.style?.includes(":scope")),
    ).toBeTrue();
    expect(visible.filter((bloc) => bloc.kind === "composition").every((bloc) => bloc.uses.length > 0)).toBeTrue();
    expect(
        visible
            .filter((bloc) => bloc.kind === "composition")
            .every((bloc) => bloc.markup?.includes('data-cms-composition-controller=""')),
    ).toBeTrue();
    expect(Object.keys(artifact.release.translations.fr ?? {}).toSorted()).toEqual(
        Object.keys(artifact.release.translations.en ?? {}).toSorted(),
    );
    expect(
        artifact.release.texts?.every(
            (text) => text.values.en?.trim() && text.values.fr?.trim() && text.label && text.category && text.group,
        ),
    ).toBeTrue();
    expect(artifact.release.exports?.blocs).toEqual(visible.map((bloc) => bloc.id).toSorted());
    expect(
        artifact.release.blocs.some((bloc) =>
            [bloc.defaultContent, bloc.markup].some((html) => html?.includes('href="#"')),
        ),
    ).toBeFalse();

    const fileInput = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-file-input");
    expect(fileInput?.markup).toContain("{{ cms.i18n.ulvia-official.ui-choose-a-file }}");
    expect(fileInput?.markup).toContain('part="replace-action"');
    expect(fileInput?.markup).toContain('data-file-replace=""');
    expect(fileInput?.markup).toContain("{{ cms.i18n.ulvia-official.ui-replace-content }}");
    expect(fileInput?.settings?.map((setting) => setting.id)).toEqual(["variant"]);
    expect(fileInput?.runtime?.viewJS).not.toMatch(/(?:button|drop|empty|remove|replace)-label/);
    expect(fileInput?.runtime?.viewJS).not.toMatch(/Choose a file|No file selected|Replace|Remove/);

    const adminWorkspace = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-admin-workspace");
    expect(adminWorkspace?.markup).toContain('<slot name="secondary-navigation" slot="secondary-sidebar"></slot>');
    expect(adminWorkspace?.markup).toContain('<slot name="page-navigation" slot="navigation"></slot>');

    const routeTabs = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-route-tabs");
    const appearance = routeTabs?.settings?.find((setting) => setting.id === "appearance");
    expect(appearance?.control?.options?.map((option) => option.value)).toEqual(["underline", "pills"]);
    expect(routeTabs?.markup).not.toContain('role="tablist"');
    expect(routeTabs?.runtime?.viewJS).toContain("ArrowRight");
    expect(routeTabs?.runtime?.viewJS).toContain(".tabIndex=");
    expect(routeTabs?.runtime?.viewJS).toContain("aria-labelledby");

    const fieldHelp = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-field-help");
    expect(fieldHelp?.uses).toEqual([]);
    expect(fieldHelp?.markup).toContain('data-field-help-trigger=""');
    expect(fieldHelp?.markup).toContain('data-field-help-panel=""');
    expect(artifact.release.blocs.some((bloc) => bloc.id.startsWith("ulvia-official-field-help-"))).toBeFalse();

    const appShell = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-app-shell");
    expect(appShell?.style).toContain(':scope > [part~="shell"] > [part~="mobile-backdrop"]');
    expect(appShell?.style).toContain("button[data-mobile-toggle-close]");

    const action = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-action");
    expect(action?.style).toContain("font-family: var(--ulvia-official-font-family-main, inherit)");
    expect(action?.style).not.toContain("font: inherit;");
    expect(action?.style).toContain("max-width: 100%");
    expect(action?.style).toContain("min-height: var(--ulvia-official-action-height)");
    expect(action?.style).toContain("white-space: normal");
    expect(action?.style).not.toContain(":scope > span");

    const heading = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-heading");
    expect(heading?.slots.accent).toEqual({
        accepts: [{ kind: "native-content", profile: "phrasing" }],
        max: 1,
    });
    expect(heading?.markup).toContain('<span part="accent"><slot name="accent"></slot></span>');
    expect(heading?.style).toContain("--ulvia-official-heading-inherited-size");

    const mediaFigure = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-media-figure");
    expect(mediaFigure?.slots.title).toEqual({
        accepts: [{ kind: "native-content", profile: "inline" }],
        max: 1,
    });
    expect(mediaFigure?.settings?.find((setting) => setting.id === "surface")?.control?.options).toEqual([
        { value: "plain", label: "setting.option.none" },
        { value: "inverse", label: "setting.option.inverse" },
    ]);

    const hero = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-hero");
    expect(hero?.uses).toContain("ulvia-official-media-figure");
    expect(hero?.slots.media?.accepts).toContainEqual({
        kind: "component",
        tag: "ulvia-official-media-figure",
    });
    expect(() =>
        validatePageDocument(
            '<div cms-bloc="ulvia-official-hero"><h1 cms-bloc="ulvia-official-heading" slot="heading">Understand Gen Z.<span slot="accent">Engage your teams.</span></h1><div cms-bloc="ulvia-official-media-figure" slot="media" ratio="square" surface="inverse"><strong slot="title">Ada Lovelace</strong><span slot="caption">Trainer</span></div></div>',
            artifact.release.blocs,
        ),
    ).not.toThrow();

    const link = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-link");
    expect(link?.style).not.toContain("height: 100%");

    const timeInput = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-time-input");
    expect(timeInput?.style).toContain("max-width: 100%");
    expect(timeInput?.style).toContain("flex: 0 1 3rem");

    const colorInput = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-color-input");
    expect(colorInput?.style).toContain("@container (max-width: 20rem)");
    expect(colorInput?.style).toContain("grid-template-columns: minmax(0, 1fr)");

    const grid = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-grid");
    expect(grid?.style).toContain("repeat(auto-fit, minmax(min(100%, 18rem), 1fr))");

    const dataTable = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-data-table");
    expect(dataTable).toMatchObject({ kind: "component", root: { accepts: ["div"] } });
    expect(dataTable?.runtime?.viewJS).toBeUndefined();
    expect(dataTable?.slots).toMatchObject({
        caption: { min: 1, max: 1 },
        columns: { min: 1 },
        rows: {},
    });
    expect(dataTable?.style).toContain("overflow-x: auto");
    expect(dataTable?.style).toContain("min-width: 36rem");

    const columnHeader = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-data-table-column-header");
    const rowHeader = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-data-table-row-header");
    expect(columnHeader).toMatchObject({
        catalogue: "hidden",
        root: { accepts: ["th"], attributes: { scope: { required: true, values: ["col"] } } },
    });
    expect(rowHeader).toMatchObject({
        catalogue: "hidden",
        root: { accepts: ["th"], attributes: { scope: { required: true, values: ["row"] } } },
    });
    expect(() =>
        validatePageDocument(
            '<div cms-bloc="ulvia-official-data-table"><span slot="caption">Users</span><th cms-bloc="ulvia-official-data-table-column-header" scope="row" slot="columns">Name</th></div>',
            artifact.release.blocs,
        ),
    ).toThrow("scope");
    expect(() =>
        validatePageDocument(
            '<div cms-bloc="ulvia-official-data-table"><span slot="caption">Users</span><th cms-bloc="ulvia-official-data-table-column-header" scope="col" slot="columns">Name</th><tr cms-bloc="ulvia-official-data-table-row" slot="rows"><td slot="cells">Ada</td></tr></div>',
            artifact.release.blocs,
        ),
    ).toThrow("does not accept native <td>");
    expect(() =>
        validatePageDocument(
            '<div cms-bloc="ulvia-official-data-table"><th cms-bloc="ulvia-official-data-table-column-header" scope="col" slot="columns">Name</th></div>',
            artifact.release.blocs,
        ),
    ).toThrow('slot "caption" requires at least 1 item');

    const panel = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-panel");
    expect(panel?.style).toContain("flex-wrap: wrap");
    expect(panel?.style).toContain("flex: 1 1 10rem");

    expect(
        artifact.release.blocs.some((bloc) =>
            [bloc.defaultContent, bloc.markup, bloc.markup].some(
                (html) => html?.includes('appearance="sidebar"') || html?.includes('slot="contextual-navigation"'),
            ),
        ),
    ).toBeFalse();
});

test("the generated local bootstrap bundle matches official authored releases", async () => {
    const artifacts = await buildOfficialBootstrapArtifacts();
    const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-build-"));
    try {
        await writeOfficialBootstrapArtifacts(root);
        for (const [id, bytes] of Object.entries(artifacts.contracts)) {
            const segments = id.startsWith("ulvia.cms.") ? ["contracts", "cms", id] : ["contracts", id];
            expect((await readFile(join(root, ...segments, "definition.json"), "utf8")).trim()).toBe(bytes);
        }
        expect((await readFile(join(root, "providers", "ulvia.official", "definition.json"), "utf8")).trim()).toBe(
            artifacts.provider,
        );
        expect((await readFile(join(root, "collections", "ulvia-official", "release.json"), "utf8")).trim()).toBe(
            artifacts.collection,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
