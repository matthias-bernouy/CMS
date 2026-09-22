import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    CMS_FORM_EMPTY_BEHAVIORS,
    CMS_FORM_VALUE_TYPES,
    CMS_SOURCE_SERIALIZATIONS,
    isCmsFormEmptyBehavior,
    isCmsFormValueType,
    isCmsSourceSerialization,
    isCmsSourceSuccessReload,
    nativeBindingAttributeIssue,
} from "@bernouy/cms-content/editor";
import { ValidatingCmsRepository, type CmsRepository } from "@bernouy/cms-content";

const form = (attributes: string, children = "", method = "PATCH") =>
    `<fixture-card><form cms-source="/api/orders/update" cms-source-method="${method}" cms-source-trigger="submit" ${attributes}>${children}</form></fixture-card>`;

function repository() {
    const writes: string[] = [];
    const inner = {
        getBlocsList: async () => [{ id: "fixture-card" }, { id: "fixture-field" }],
        insertPage: async (_path: string, _title: string, content: string) => writes.push(content),
        updatePage: async (page: { content: string }) => writes.push(page.content),
    } as unknown as CmsRepository;
    return { repo: new ValidatingCmsRepository(inner), writes };
}

describe("declarative form contracts", () => {
    test("exposes controlled serialization and control-value helpers", () => {
        expect(CMS_SOURCE_SERIALIZATIONS).toEqual(["typed-json"]);
        expect(CMS_FORM_VALUE_TYPES).toEqual(["string", "number", "boolean"]);
        expect(CMS_FORM_EMPTY_BEHAVIORS).toEqual(["null", "omit"]);
        expect(isCmsSourceSerialization("typed-json")).toBe(true);
        expect(isCmsSourceSerialization("json")).toBe(false);
        for (const value of CMS_FORM_VALUE_TYPES) {
            expect(isCmsFormValueType(value)).toBe(true);
        }
        for (const value of CMS_FORM_EMPTY_BEHAVIORS) {
            expect(isCmsFormEmptyBehavior(value)).toBe(true);
        }
        expect(isCmsFormValueType("object")).toBe(false);
        expect(isCmsFormEmptyBehavior("undefined")).toBe(false);
        expect(isCmsSourceSuccessReload("#order-detail")).toBe(true);
        for (const value of [null, "", "order-detail", "#detail .child", "#a,#b", "#{target}", "{{ target }}"]) {
            expect(isCmsSourceSuccessReload(value)).toBe(false);
        }
    });

    test("preserves typed fields and reload targets through both page-write boundaries", async () => {
        const { repo, writes } = repository();
        const content = form(
            'cms-source-serialization="typed-json" cms-source-success-reload="#order-detail"',
            '<input name="items[0][price]" cms-form-value-type="number" cms-form-empty="null"><fixture-field name="note" cms-form-value-type="string" cms-form-empty="omit"></fixture-field>',
        );
        await repo.insertPage("/orders", "Orders", content);
        await repo.updatePage({ id: "page", content });
        for (const html of writes) {
            const { document } = parseHTML(html);
            expect(document.querySelector("form")?.getAttribute(CMS_BINDING_ATTRIBUTES.sourceSuccessReload)).toBe(
                "#order-detail",
            );
            expect(document.querySelector("input")?.getAttribute(CMS_BINDING_ATTRIBUTES.formValueType)).toBe("number");
            expect(document.querySelector("fixture-field")?.getAttribute(CMS_BINDING_ATTRIBUTES.formEmpty)).toBe(
                "omit",
            );
        }
    });

    test("rejects invalid values and attribute placement at both page-write boundaries", async () => {
        const invalid = [
            form('cms-source-success-reload="#detail .child"'),
            form('cms-source-success-reload="{{ target }}"'),
            form('cms-source-serialization="json"'),
            form('cms-source-serialization="typed-json"', "", "GET"),
            form("", '<input cms-form-value-type="object">'),
            form("", '<input cms-form-empty="undefined">'),
            form('cms-form-value-type="string"'),
            form("", '<section cms-source-serialization="typed-json"></section>'),
            form("", '<section cms-source-success-reload="#detail"></section>'),
            form("", '<section cms-form-empty="null"></section>'),
            form('cms-source-success-update="#detail"'),
            form('cms-arbitrary="true"'),
        ];
        for (const content of invalid) {
            const { repo } = repository();
            await expect(repo.insertPage("/orders", "Orders", content)).rejects.toThrow();
            await expect(repo.updatePage({ id: "page", content })).rejects.toThrow();
        }
    });

    test("keeps ordinary forms valid without typed serialization", async () => {
        const { repo } = repository();
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
            await repo.insertPage("/orders", "Orders", form("", '<input name="query">', method));
        }
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.formValueType, "boolean")).toBeNull();
    });
});
