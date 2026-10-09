import { expect, test } from "bun:test";
import { assertContentRefsExist } from "@bernouy/cms-content";
import { validatePageContentMarkup } from "cms-content/blocs/core/markup/validation/nativeContent";

const repository: any = {
    getBlocsList: async () => [
        {
            id: "fixture-card",
            slots: { body: { accepts: [{ kind: "rich-text", profile: "prose" }] } },
        },
        { id: "fixture-action", nativeElement: { accepts: ["button", "a"] } },
    ],
};

async function validate(content: string): Promise<void> {
    await assertContentRefsExist(repository, validatePageContentMarkup(content));
}

test("Page-owned rich text rejects arbitrary native attributes", async () => {
    await validate('<fixture-card><p slot="body">Text</p></fixture-card>');
    for (const attribute of ['style="color:red"', 'data-track="body"', 'aria-label=""']) {
        await expect(validate(`<fixture-card><p slot="body" ${attribute}>Text</p></fixture-card>`)).rejects.toThrow(
            "not allowed",
        );
    }
});

test("Page-owned rich text rejects descendant slot targets", async () => {
    await expect(
        validate('<fixture-card><p slot="body"><span slot="ghost">Text</span></p></fixture-card>'),
    ).rejects.toThrow("does not accept native");
});

test("managed native children use the closed native attribute policy", async () => {
    await validate('<fixture-action><button type="button">Save</button></fixture-action>');
    await validate('<fixture-action><button type="button" aria-label="Save"></button></fixture-action>');
    for (const attribute of ['type="wat"', 'style="position:fixed"', 'mystery="value"']) {
        await expect(validate(`<fixture-action><button ${attribute}>Save</button></fixture-action>`)).rejects.toThrow();
    }
    await expect(validate('<fixture-action><button type="button"></button></fixture-action>')).rejects.toThrow(
        "requires text content or a non-empty aria-label",
    );
    await expect(
        validate('<fixture-action><a aria-current="selected">Current page</a></fixture-action>'),
    ).rejects.toThrow("aria-current");
});

test("Page documents reject comments", () => {
    expect(() => validatePageContentMarkup("<!-- hidden --><fixture-card></fixture-card>")).toThrow("comments");
});

test("Page writes reject executable markup instead of silently repairing it", () => {
    for (const content of [
        "<script>alert(1)</script>",
        '<fixture-card onclick="alert(1)"></fixture-card>',
        '<fixture-card><a slot="body" href="javascript:alert(1)">Bad</a></fixture-card>',
    ]) {
        expect(() => validatePageContentMarkup(content)).toThrow(/forbidden/);
    }
});
