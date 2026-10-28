import { expect, test } from "bun:test";
import { collectionFixture, collectionDocument, parseCollectionRelease, textDefinition, example } from "./fixture";

test("example documents admit typed capability forms owned by a composition", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const form =
        '<form cms-mutation="catalog.items:item.rename as renamed"><label for="title">{{ copy }}</label><input id="title" type="text" name="title" required><input type="hidden" name="expectedRevision" value="1" cms-form-value-type="number"><button type="submit">{{ copy }}</button></form>';
    (source.blocs as Record<string, unknown>[]).push({
        description: "bloc.page.label",
        categories: ["bloc.page.label"],

        kind: "composition",
        root: { accepts: ["div"] },
        id: "atlas-form-page",
        label: "bloc.page.label",
        markup: form,
        slots: {},
        uses: [],
        requires: [{ contractId: "catalog.items", capabilityId: "item.rename", versionRange: "^1.0.0" }],
    });
    const mutation = {
        ...example,
        document: { html: '<div cms-bloc="atlas-form-page"></div>' },
    };
    expect(() => parseCollectionRelease(collectionFixture({ ...source, examples: [mutation] }))).not.toThrow();
    for (const html of [
        form.replace('cms-mutation="catalog.items:item.rename as renamed"', 'action="https://example.com"'),
        form.replace("catalog.items:item.rename as renamed", "catalog.items:item.rename"),
        form.replace('cms-form-value-type="number"', 'cms-form-value-type="object"'),
    ]) {
        const invalid = structuredClone(source);
        (invalid.blocs as Record<string, unknown>[]).find(({ id }) => id === "atlas-form-page")!.markup = html;
        expect(() => parseCollectionRelease(collectionFixture({ ...invalid, examples: [mutation] }))).toThrow();
    }
});

test("example documents use declared Access capabilities instead of Edge-owned authentication", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const authentication = {
        description: "bloc.page.label",
        categories: ["bloc.page.label"],

        kind: "composition",
        root: { accepts: ["div"] },
        id: "atlas-authentication",
        label: "bloc.page.label",
        markup: `<section>
            <form cms-mutation="ulvia.cms.access:login-password as session">
                <input type="email" name="email" required>
                <input type="password" name="password" required>
                <button type="submit">{{ copy }}</button>
            </form>
        </section>`,
        slots: {},
        uses: [],
        requires: [
            {
                contractId: "ulvia.cms.access",
                capabilityId: "login-password",
                versionRange: "^1.0.0",
            },
        ],
    };
    const login = { ...example, document: { html: '<div cms-bloc="atlas-authentication"></div>' } };
    expect(() =>
        parseCollectionRelease(
            collectionFixture({ ...source, blocs: [...source.blocs, authentication], examples: [login] }),
        ),
    ).not.toThrow();

    for (const markup of [
        authentication.markup.replace("ulvia.cms.access:login-password", "edge.auth:login"),
        authentication.markup.replace("ulvia.cms.access:login-password", "edge.auth:secrets"),
    ]) {
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...source,
                    blocs: [...source.blocs, { ...authentication, markup }],
                    examples: [login],
                }),
            ),
        ).toThrow();
    }
});

test("Pages reject removed edge file transports", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const html = `<section>
        <form cms-source="/.cms/call/ulvia.cms.files/uploads" cms-source-method="POST" cms-source-trigger="submit">
            <input type="file" name="file" required><button type="submit">{{ copy }}</button>
        </form>
        <form cms-source="/.cms/call/ulvia.cms.files/uploads/upload_123" cms-source-method="PUT" cms-source-trigger="submit">
            <input type="hidden" name="id" value="{{ item.id }}">
            <input type="file" name="file" required><button type="submit">{{ copy }}</button>
        </form>
        <a href="/.cms/call/ulvia.cms.files/files/{{ item.id }}/{{ item.generation }}" target="_blank" rel="noopener">{{ copy }}</a>
    </section>`;
    expect(() =>
        parseCollectionRelease(collectionFixture({ ...source, examples: [{ ...example, document: { html } }] })),
    ).toThrow();
});
