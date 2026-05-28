import { describe, test, expect, beforeEach } from "bun:test";
import { ImageSync } from "src/control/components/editor/componentSync/sync/ImageSync/ImageSync";

function reset() {
    document.body.innerHTML = "";
    const host = document.createElement("div");
    host.id = p9r.id.EDITOR_SYSTEM;
    document.body.appendChild(host);
}

function buildPair(opts: { optionnal?: boolean; isCreating?: boolean; slot?: string; defaultSrc?: string } = {}) {
    reset();
    const parentId = "img-parent-" + Math.random().toString(36).slice(2);
    const parent = document.createElement("div");
    parent.setAttribute(p9r.attr.EDITOR.IDENTIFIER, parentId);
    if (opts.isCreating) parent.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
    document.body.appendChild(parent);

    const sync = new ImageSync();
    if (opts.optionnal) sync.setAttribute("optionnal", "");
    if (opts.slot) sync.setAttribute("slotTarget", opts.slot);
    sync.setAttribute("default", opts.defaultSrc ?? "https://placehold.co/800x450");
    sync.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    document.body.appendChild(sync);
    return { parent, sync };
}

function nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
}

describe("ImageSync — optionnal + IS_CREATING gating", () => {
    beforeEach(() => reset());

    test("non-optional: default image is always seeded even without IS_CREATING", async () => {
        const { parent } = buildPair({ optionnal: false, isCreating: false });
        await nextFrame();
        expect(parent.querySelector("img")).not.toBeNull();
    });

    test("optional + IS_CREATING: default image IS seeded (first-time bloc setup)", async () => {
        const { parent } = buildPair({ optionnal: true, isCreating: true });
        await nextFrame();
        expect(parent.querySelector("img")).not.toBeNull();
    });

    test("optional + NOT creating: default image is NOT re-seeded", async () => {
        // Simulates the user deleting the image on a previously-saved bloc:
        // the bloc no longer carries IS_CREATING, so nothing should come back.
        const { parent } = buildPair({ optionnal: true, isCreating: false });
        await nextFrame();
        expect(parent.querySelector("img")).toBeNull();
    });

    test("optional + NOT creating + existing image: preserved as-is", async () => {
        const parentId = "img-existing";
        const parent = document.createElement("div");
        parent.setAttribute(p9r.attr.EDITOR.IDENTIFIER, parentId);
        const existing = document.createElement("img");
        existing.setAttribute("src", "https://example.com/kept.jpg");
        parent.appendChild(existing);
        document.body.appendChild(parent);

        const sync = new ImageSync();
        sync.setAttribute("optionnal", "");
        sync.setAttribute("default", "https://placehold.co/800x450");
        sync.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
        document.body.appendChild(sync);
        await nextFrame();

        const imgs = parent.querySelectorAll("img");
        expect(imgs.length).toBe(1);
        expect(imgs[0]!.getAttribute("src")).toBe("https://example.com/kept.jpg");
    });
});
