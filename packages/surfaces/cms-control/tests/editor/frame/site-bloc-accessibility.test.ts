import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { scanPreviewAccessibility } from "cms-control/components/editorSystemV2/siteBloc/previewAccessibility";

describe("site bloc preview accessibility scan", () => {
    test("reports missing names, labels, alt attributes and duplicated ids", () => {
        const { document } = parseHTML(`<!doctype html><html><body>
            <img src="missing.webp">
            <img src="decorative.webp" alt="">
            <button><svg aria-hidden="true"></svg></button>
            <a href="/named" aria-label="Named link"></a>
            <input id="unlabelled">
            <label for="labelled">Email</label><input id="labelled">
            <div id="duplicate"></div><section id="duplicate"></section>
        </body></html>`);

        expect(scanPreviewAccessibility(document)).toEqual([
            { kind: "image-alt", count: 1, message: "images are missing an alt attribute" },
            { kind: "interactive-name", count: 1, message: "buttons or links have no accessible name" },
            { kind: "control-label", count: 1, message: "form controls have no label" },
            { kind: "duplicate-id", count: 1, message: "elements use a duplicated id" },
        ]);
    });

    test("accepts native and ARIA labelling without treating empty alt as missing", () => {
        const { document } = parseHTML(`<!doctype html><html><body>
            <img alt="" src="decoration.webp">
            <button aria-labelledby="save-label"><svg></svg></button><span id="save-label">Save</span>
            <a href="/home"><img alt="Home" src="home.webp"></a>
            <label>Search <input></label>
            <select aria-label="Category"><option>All</option></select>
        </body></html>`);

        expect(scanPreviewAccessibility(document)).toEqual([]);
    });

    test("scans nested open shadow roots and keeps duplicate ids scoped to each tree", () => {
        const preview = document.implementation.createHTMLDocument("Preview");
        preview.body.innerHTML = '<div id="shared"></div>';
        const host = preview.createElement("photo-card");
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = '<span id="shared"></span><img src="shadow.webp"><button></button>';
        preview.body.append(host);

        expect(scanPreviewAccessibility(preview)).toEqual([
            { kind: "image-alt", count: 1, message: "images are missing an alt attribute" },
            { kind: "interactive-name", count: 1, message: "buttons or links have no accessible name" },
        ]);
    });
});
