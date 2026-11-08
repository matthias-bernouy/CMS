import { expect, test } from "bun:test";
import { writeResourceArchive } from "../src/exports";
import { documentFixture, blocFixture } from "./fixtures";

test("rejects duplicate ordinary identities, missing default texts and noncanonical locales", async () => {
    const text = { id: "welcome", category: "General", group: "Base", label: "Welcome", values: { en: "Hello" } };
    const source = { namespace: "acme/base", locale: "en", texts: [text] };
    for (const document of [
        { ...documentFixture(), blocs: [blocFixture(), blocFixture()] },
        { ...documentFixture(), texts: [source, source] },
        { ...documentFixture(), texts: [{ ...source, texts: [text, text] }] },
        { ...documentFixture(), texts: [{ ...source, locale: "fr" }] },
        { ...documentFixture(), texts: [{ ...source, locale: "EN" }] },
        { ...documentFixture(), texts: [{ ...source, texts: [{ ...text, id: "bad id" }] }] },
        { ...documentFixture(), texts: [{ ...source, texts: [{ ...text, values: { en: "{{ nested }}" } }] }] },
    ]) {
        await expect(writeResourceArchive({ document, assets: [] })).rejects.toBeInstanceOf(Error);
    }
});

test("rejects globally scoped CSS and rechecks palette ownership inside the compiled scope", async () => {
    const scoped = (css: string) =>
        `@layer ulvia.blocks {\n@scope ([cms-bloc="sample-card"]) to (:scope [cms-bloc]) {\n${css}\n}\n}`;
    for (const styleCSS of [
        "body { color: red; }",
        scoped("p { color: red; }"),
        scoped("p { --unowned-input: 1; }"),
        scoped("@font-face { font-family: global; src: local(global); }"),
        scoped("}"),
    ]) {
        const document = { ...documentFixture(), blocs: [blocFixture({ styleCollectionId: "acme/base", styleCSS })] };
        await expect(writeResourceArchive({ document, assets: [] })).rejects.toBeInstanceOf(Error);
    }
    const document = {
        ...documentFixture(),
        blocs: [blocFixture({ styleCollectionId: "acme/base", styleCSS: scoped("p { padding: 1rem; }") })],
    };
    const result = await writeResourceArchive({ document, assets: [] });
    expect(result.document.blocs[0]?.styleCSS).toBe(document.blocs[0].styleCSS);
});

test("refuses reserved routes, duplicate Page paths and ambiguous login roles", async () => {
    const page = { path: "/welcome", title: "Welcome", description: "", html: "", visible: false, indexing: false };
    for (const pages of [
        [{ ...page, path: "/_content/private" }],
        [page, page],
        [
            { ...page, systemRole: "login" },
            { ...page, path: "/login", systemRole: "login" },
        ],
    ]) {
        await expect(
            writeResourceArchive({ document: { ...documentFixture(), pages }, assets: [] }),
        ).rejects.toBeInstanceOf(Error);
    }
});

test("requires a closed acyclic Bloc graph and known static texts and assets", async () => {
    const card = blocFixture();
    for (const blocs of [
        [{ ...card, uses: ["missing-card"] }],
        [{ ...card, uses: [card.id] }],
        [
            { ...card, uses: ["other-card"] },
            { ...card, id: "other-card", uses: [card.id] },
        ],
        [{ ...card, markupHTML: "<p>{{ cms.i18n.acme/base.missing }}</p>" }],
        [{ ...card, markupHTML: '<img src="{{ cms.asset.acme/base.missing.png }}" alt="Missing">' }],
    ]) {
        await expect(
            writeResourceArchive({ document: { ...documentFixture(), blocs }, assets: [] }),
        ).rejects.toBeInstanceOf(Error);
    }
});
