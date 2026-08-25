import { afterEach, describe, expect, test } from "bun:test";
import type { MediaInput } from "cms-control/components/form/MediaInput/MediaInput";
import "cms-control/components/form/MediaInput/MediaInput";
import { buildFields } from "cms-control/components/media/GridMedia/features/detail/builders";

afterEach(() => document.body.replaceChildren());

async function fragment(path: string): Promise<DocumentFragment> {
    const html = await Bun.file(new URL(path, import.meta.url)).text();
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
}

describe("admin media accessibility", () => {
    test("keeps the media picker actions separate, named, and focusable", () => {
        const control = document.createElement("cms-media-input") as MediaInput;
        control.setAttribute("label", "Site logo");
        control.setAttribute("aria-label", "Choose site logo");
        control.setAttribute("value", "/media/logo.svg");
        document.body.append(control);

        const root = control.shadowRoot!;
        const label = root.querySelector<HTMLLabelElement>("label")!;
        const tile = root.querySelector<HTMLButtonElement>(".tile")!;
        const clear = root.querySelector<HTMLButtonElement>(".clear")!;
        let change: Event | undefined;
        control.addEventListener("change", (event) => {
            change = event;
        });

        expect({
            labelFor: label.htmlFor,
            tileId: tile.id,
            tileName: tile.getAttribute("aria-label"),
            clearName: clear.getAttribute("aria-label"),
            buttonCount: root.querySelectorAll("button").length,
            clearNestedInTile: tile.contains(clear),
        }).toEqual({
            labelFor: "media-tile",
            tileId: "media-tile",
            tileName: "Choose site logo",
            clearName: "Remove Site logo",
            buttonCount: 2,
            clearNestedInTile: false,
        });

        control.focus();
        expect(root.activeElement).toBe(tile);
        clear.click();
        expect(control.value).toBe("");
        expect(change?.composed).toBe(true);
    });

    test("associates editable media fields and names the copy action", () => {
        const fields = buildFields({
            id: "logo",
            type: "image",
            label: "Logo",
            alt: "Company logo",
            absoluteURL: "/media/logo.svg",
            mimetype: "image/svg+xml",
        });

        expect(fields.querySelector<HTMLLabelElement>("label[for='detail-label']")?.htmlFor).toBe("detail-label");
        expect(fields.querySelector("#detail-label")).not.toBeNull();
        expect(fields.querySelector<HTMLLabelElement>("label[for='detail-alt']")?.htmlFor).toBe("detail-alt");
        expect(fields.querySelector("#detail-alt")).not.toBeNull();
        const copy = fields.querySelector<HTMLButtonElement>("#btn-copy")!;
        expect({ type: copy.type, name: copy.getAttribute("aria-label") }).toEqual({
            type: "button",
            name: "Copy media URL",
        });
    });

    test("names media dialogs, close buttons, and aspect-ratio controls", async () => {
        const crop = await fragment("../../../src/components/media/CropSystem/template.html");
        const details = await fragment("../../../src/components/media/DetailMedia/template.html");

        expect(crop.querySelector("[role='dialog']")?.getAttribute("aria-labelledby")).toBe("crop-title");
        expect(crop.querySelector("#close-btn")?.getAttribute("aria-label")).toBe("Close crop dialog");
        expect(crop.querySelector(".ratio-buttons")?.getAttribute("aria-labelledby")).toBe("aspect-ratio-label");
        expect(details.querySelector("[role='dialog']")?.getAttribute("aria-labelledby")).toBe("title");
        expect(details.querySelector("#close-btn")?.getAttribute("aria-label")).toBe("Close file details");
    });

    test("associates folder inputs and names media-center actions", async () => {
        const grid = await fragment("../../../src/components/media/GridMedia/view/template.html");
        const center = await fragment("../../../src/components/media/MediaCenter/template.html");

        expect(grid.querySelector<HTMLLabelElement>("label[for='nf-input']")?.htmlFor).toBe("nf-input");
        expect(grid.querySelector("#nf-input")).not.toBeNull();
        expect(grid.querySelector<HTMLLabelElement>("label[for='rename-input']")?.htmlFor).toBe("rename-input");
        expect(grid.querySelector("#rename-input")).not.toBeNull();
        expect(center.querySelector<HTMLLabelElement>("label[for='nf-input']")?.htmlFor).toBe("nf-input");
        expect(center.querySelector("#nf-input")).not.toBeNull();
        expect(center.querySelector("#btnClose")?.getAttribute("aria-label")).toBe("Close media center");
    });

    test("keeps static admin form controls explicitly named", async () => {
        const general = await Bun.file(
            new URL("../../../src/static/admin/_access/settings/general.html", import.meta.url),
        ).text();
        const users = await Bun.file(new URL("../../../src/static/admin/_access/users.html", import.meta.url)).text();

        expect(general).toContain('<p9r-textarea name="site.theme" label="Theme CSS"');
        expect(users).toContain('<cms-role-select name="role" value="user" label="Role"');
    });
});
