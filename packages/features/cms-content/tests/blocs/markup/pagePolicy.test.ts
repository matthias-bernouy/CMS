import { expect, test } from "bun:test";
import { assertContentRefsExist } from "@bernouy/cms-content";
import { validatePageContentMarkup } from "cms-content/blocs/core/markup/validation/nativeContent";

const repository: any = {
    getBlocsList: async () => [
        {
            id: "fixture-card",
            kind: "component",
            markupHTML: '<slot name="body"></slot>',
            root: { accepts: ["div"] },
            slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
        },
        {
            id: "fixture-action",
            kind: "component",
            markupHTML: "<slot></slot>",
            root: { accepts: ["div"] },
            slots: {
                "": {
                    accepts: [{ kind: "native-element", accepts: ["button", "a"] }],
                    min: 1,
                    max: 1,
                },
            },
        },
    ],
};

async function validate(content: string): Promise<void> {
    await assertContentRefsExist(repository, validatePageContentMarkup(content));
}

test("Page-owned rich text rejects arbitrary native attributes", async () => {
    await validate('<div cms-bloc=\"fixture-card\"><p slot="body">Text</p></div>');
    await validate('<div cms-bloc=\"fixture-card\"><p slot="body" aria-label="Summary">Text</p></div>');
    for (const attribute of ['style="color:red"', 'data-track="body"']) {
        await expect(
            validate(`<div cms-bloc=\"fixture-card\"><p slot="body" ${attribute}>Text</p></div>`),
        ).rejects.toThrow("not allowed");
    }
    await expect(
        validate('<div cms-bloc=\"fixture-card\"><p slot="body" aria-label="">Text</p></div>'),
    ).rejects.toThrow("must not be empty");
});

test("Page-owned rich text rejects descendant slot targets", async () => {
    await expect(
        validate('<div cms-bloc=\"fixture-card\"><p slot="body"><span slot="ghost">Text</span></p></div>'),
    ).rejects.toThrow("does not accept native");
});

test("managed native children use the closed native attribute policy", async () => {
    await validate('<div cms-bloc=\"fixture-action\"><button type="button">Save</button></div>');
    await validate('<div cms-bloc=\"fixture-action\"><button type="button" aria-label="Save"></button></div>');
    await validate('<div cms-bloc=\"fixture-action\"><button type="button" aria-invalid="true">Save</button></div>');
    for (const attribute of ['type="wat"', 'style="position:fixed"', 'mystery="value"']) {
        await expect(
            validate(`<div cms-bloc=\"fixture-action\"><button ${attribute}>Save</button></div>`),
        ).rejects.toThrow();
    }
    await expect(validate('<div cms-bloc=\"fixture-action\"><button type="button"></button></div>')).rejects.toThrow(
        "requires text content or a non-empty aria-label",
    );
    await expect(
        validate('<div cms-bloc=\"fixture-action\"><a aria-current="selected">Current page</a></div>'),
    ).rejects.toThrow("aria-current");
    await expect(
        validate('<div cms-bloc=\"fixture-action\"><button type="button" aria-invalid="wrong">Save</button></div>'),
    ).rejects.toThrow("uncontrolled ARIA value");
});

test("validates typed native attribute interpolation before storing a Page", async () => {
    await validate(
        '<div cms-bloc=\"fixture-action\"><button type="button" disabled="{{ request.loading }}" aria-expanded="{{ menu.open }}">Save</button></div>',
    );
    await validate(
        '<div cms-bloc=\"fixture-action\"><button type="button" disabled="{{ request.state === \'pending\' }}">Save</button></div>',
    );
    for (const attribute of [
        'disabled="before {{ request.loading }}"',
        "disabled=\"{{ request.state == 'pending' }}\"",
        'disabled="{{ request.state | string }}"',
        'disabled="{{ request.loading | custom }}"',
        'disabled="#{request.loading}"',
        'disabled="@{request.loading}"',
        'cms-bind-boolean-disabled="request.loading"',
    ]) {
        await expect(
            validate(`<div cms-bloc=\"fixture-action\"><button type="button" ${attribute}>Save</button></div>`),
        ).rejects.toThrow();
    }
});

test("Page documents reject comments", () => {
    expect(() => validatePageContentMarkup('<!-- hidden --><div cms-bloc="fixture-card"></div>')).toThrow("comments");
});

test("Page writes reject executable markup instead of silently repairing it", () => {
    for (const content of [
        "<script>alert(1)</script>",
        '<div cms-bloc=\"fixture-card\" onclick="alert(1)"></div>',
        '<div cms-bloc=\"fixture-card\"><a slot="body" href="javascript:alert(1)">Bad</a></div>',
    ]) {
        expect(() => validatePageContentMarkup(content)).toThrow(/forbidden/);
    }
});
