import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validatePageDocument } from "@bernouy/cms-content/page-document";
import { buildOfficialBootstrapArtifacts, writeOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import { prepareCollectionRelease } from "../../src/release/source";
import { officialContractCatalogue } from "../officialContractCatalogue";

test("the official collection passes its source quality contract", async () => {
    const source = resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official");
    const artifact = await prepareCollectionRelease(source, await officialContractCatalogue());
    const showcaseRoot = resolve(import.meta.dir, "../../../../official-repository/showcases/ulvia-official");
    for (const name of (await readdir(showcaseRoot)).filter((entry) => entry.endsWith(".html"))) {
        const html = await readFile(join(showcaseRoot, name), "utf8");
        expect(html).not.toMatch(/<ulvia-[a-z]/u);
        try {
            validatePageDocument(html, artifact.release.blocs);
        } catch (error) {
            throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
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
            [bloc.defaultContent, bloc.lightdom, bloc.template].some((html) => html?.includes('href="#"')),
        ),
    ).toBeFalse();

    const fileInput = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-file-input");
    expect(fileInput?.template).toContain('<span part="prompt">{{ cms.i18n.ulvia-official.ui-choose-a-file }}</span>');
    expect(fileInput?.template).toContain(
        '<button part="replace-action" type="button" data-file-replace="">{{ cms.i18n.ulvia-official.ui-replace-content }}</button>',
    );
    expect(fileInput?.settings?.map((setting) => setting.id)).toEqual(["variant"]);
    expect(fileInput?.runtime?.viewJS).not.toMatch(/(?:button|drop|empty|remove|replace)-label/);
    expect(fileInput?.runtime?.viewJS).not.toMatch(/Choose a file|No file selected|Replace|Remove/);

    const adminWorkspace = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-admin-workspace");
    expect(adminWorkspace?.lightdom).toContain('<slot name="secondary-navigation" slot="secondary-sidebar"></slot>');
    expect(adminWorkspace?.lightdom).toContain('<slot name="page-navigation" slot="navigation"></slot>');

    const routeTabs = artifact.release.blocs.find((bloc) => bloc.id === "ulvia-official-route-tabs");
    const appearance = routeTabs?.settings?.find((setting) => setting.id === "appearance");
    expect(appearance?.control?.options?.map((option) => option.value)).toEqual(["underline", "pills"]);
    expect(routeTabs?.template).toContain('role="tablist" aria-orientation="horizontal"');
    expect(routeTabs?.runtime?.viewJS).toContain("ArrowRight");
    expect(routeTabs?.runtime?.viewJS).toContain(".tabIndex=");
    expect(routeTabs?.runtime?.viewJS).toContain("aria-labelledby");

    expect(
        artifact.release.blocs.some((bloc) =>
            [bloc.defaultContent, bloc.lightdom, bloc.template].some(
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
