import { describe, expect, test } from "bun:test";
import {
    CMS_BINDING_ATTRIBUTES,
    CMS_FORM_EMPTY_BEHAVIORS,
    CMS_FORM_VALUE_TYPES,
    isCmsFormEmptyBehavior,
    isCmsFormValueType,
} from "@bernouy/cms-content/bindings";
import { nativeBindingAttributeIssue, ValidatingContentRepository, type ContentRepository } from "@bernouy/cms-content";

const form = (attributes: string, children = "") =>
    `<div cms-bloc=\"fixture-card\"><form cms-mutation="orders:update as saved" ${attributes}>${children}</form></div>`;

function repository() {
    const writes: string[] = [];
    const inner = {
        getBlocsList: async () => [
            { id: "fixture-card", root: { accepts: ["div"] } },
            { id: "fixture-field", root: { accepts: ["div"] } },
        ],
        insertPage: async (_path: string, _title: string, content: string) => writes.push(content),
        updatePage: async (page: { content: string }) => writes.push(page.content),
    } as unknown as ContentRepository;
    return { repo: new ValidatingContentRepository(inner), writes };
}

describe("declarative form contracts", () => {
    test("accepts the compact mutation grammar without transport attributes", () => {
        expect(
            nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.mutation, "ulvia.cms.content:pages.update as saved"),
        ).toBeNull();
        expect(
            nativeBindingAttributeIssue(
                CMS_BINDING_ATTRIBUTES.mutationInput,
                '{"id":{"from":"literal","value":"page"}}',
            ),
        ).toBeNull();
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.mutationReset, "false")).toBeNull();
    });

    test("exposes control-value helpers", () => {
        expect(CMS_FORM_VALUE_TYPES).toEqual(["string", "number", "boolean", "json"]);
        expect(CMS_FORM_EMPTY_BEHAVIORS).toEqual(["null", "omit"]);
        for (const value of CMS_FORM_VALUE_TYPES) {
            expect(isCmsFormValueType(value)).toBe(true);
        }
        for (const value of CMS_FORM_EMPTY_BEHAVIORS) {
            expect(isCmsFormEmptyBehavior(value)).toBe(true);
        }
        expect(isCmsFormValueType("object")).toBe(false);
        expect(isCmsFormEmptyBehavior("undefined")).toBe(false);
    });

    test("rejects typed forms that are not owned by a Bloc contract", async () => {
        const { repo, writes } = repository();
        const content = form(
            "",
            '<input name="items[0][price]" cms-form-value-type="number" cms-form-empty="null"><div cms-bloc=\"fixture-field\" name="note" cms-form-value-type="string" cms-form-empty="omit"></div>',
        );
        await expect(repo.insertPage("/orders", "Orders", content)).rejects.toThrow("requires a control");
        await expect(repo.updatePage({ id: "page", content })).rejects.toThrow("requires a control");
        expect(writes).toEqual([]);
    });

    test("rejects invalid values and attribute placement at both page-write boundaries", async () => {
        const invalid = [
            form('cms-mutation-invalidates="detail detail"'),
            form('cms-mutation-invalidates="{{ target }}"'),
            form('cms-mutation-idempotency="manual"'),
            form('cms-mutation-reset="maybe"'),
            form("", '<input cms-form-value-type="object">'),
            form("", '<input cms-form-empty="undefined">'),
            form('cms-form-value-type="string"'),
            form("", '<section cms-mutation-idempotency="auto"></section>'),
            form("", '<section cms-mutation-invalidates="detail"></section>'),
            form("", '<section cms-form-empty="null"></section>'),
            form('cms-mutation-unknown="#detail"'),
            form('cms-arbitrary="true"'),
        ];
        for (const content of invalid) {
            const { repo } = repository();
            await expect(repo.insertPage("/orders", "Orders", content)).rejects.toThrow();
            await expect(repo.updatePage({ id: "page", content })).rejects.toThrow();
        }
    });

    test("rejects ordinary forms that bypass Bloc ownership", async () => {
        const { repo } = repository();
        await expect(repo.insertPage("/orders", "Orders", form("", '<input name="query">'))).rejects.toThrow(
            "does not declare slot",
        );
        expect(nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.formValueType, "boolean")).toBeNull();
    });
});
