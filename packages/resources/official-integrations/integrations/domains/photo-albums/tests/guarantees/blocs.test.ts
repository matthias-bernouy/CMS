import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareNetworkInertBindings } from "@bernouy/components/binding-dom";
import { syncResponsiveSourceImageElement } from "@bernouy/cms-source-images/browser";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const integrationRoot = resolve(OFFICIAL_INTEGRATIONS_ROOT, "collections/ulvia");
const blocNames = ["photo-album-list", "photo-album-gallery"] as const;

async function blocFile(name: (typeof blocNames)[number], file: string): Promise<string> {
    return readFile(resolve(integrationRoot, "blocs/domains/photo-albums", name, file), "utf8");
}

class TestElement {
    readonly nodeType = 1;
    readonly localName = "img";
    private readonly attributes = new Map<string, string>();

    constructor(attributes: Record<string, string>) {
        for (const [name, value] of Object.entries(attributes)) {
            this.attributes.set(name, value);
        }
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    matches(selector: string): boolean {
        return selector.split(",").includes("img");
    }

    closest(): null {
        return null;
    }

    querySelectorAll(): Element[] {
        return [];
    }
}

describe("Photo Albums public Blocs", () => {
    test.each(blocNames)("%s uses declarative Source bindings without manual requests", async (name) => {
        const [controller, editor, html, manifestText] = await Promise.all([
            blocFile(name, "Bloc.ts"),
            blocFile(name, "BlocEditor.ts"),
            blocFile(name, "default.html"),
            blocFile(name, "manifest.json"),
        ]);
        const manifest = JSON.parse(manifestText) as Record<string, string>;

        expect(`${controller}\n${editor}`).not.toMatch(/\bfetch\s*\(/);
        expect(controller).toContain('"cms-source"');
        expect(controller).toContain('"source-id"');
        expect(controller).toContain("[data-photo-source-url]");
        expect(html).toContain(`src="/.cms/sources/photo-albums/publicPhoto?id={{`);
        expect(html).not.toContain("data-src=");
        expect(html).toContain('data-photo-source-url="publicPhoto"');
        expect(html).toContain('data-source-image-access="public"');
        expect(html).toContain("data-source-width=");
        expect(html).toContain("data-source-height=");
        expect(editor).toContain('attribute: "grid-min"');
        expect(editor).toContain('slot: "loading"');
        expect(editor).toContain('slot: "error"');
        expect(manifest).toMatchObject({
            "default-tag": name,
            bloc: "./Bloc.ts",
            editor: "./BlocEditor.ts",
            defaultContent: "./default.html",
        });
    });

    test("catalogue and gallery expose focused editable content regions", async () => {
        const [listEditor, galleryEditor, listHtml, galleryHtml] = await Promise.all([
            blocFile("photo-album-list", "BlocEditor.ts"),
            blocFile("photo-album-gallery", "BlocEditor.ts"),
            blocFile("photo-album-list", "default.html"),
            blocFile("photo-album-gallery", "default.html"),
        ]);

        for (const slot of ["heading", "loading", "error", "empty", "catalogue", "pagination"]) {
            expect(listEditor).toContain(`slot: "${slot}"`);
            expect(listHtml).toContain(`slot="${slot}"`);
        }
        for (const slot of ["loading", "error", "album"]) {
            expect(galleryEditor).toContain(`slot: "${slot}"`);
            expect(galleryHtml).toContain(`slot="${slot}"`);
        }
    });

    test("dynamic Source images stay inert until binding and then receive bounded candidates", async () => {
        const html = await blocFile("photo-album-gallery", "default.html");
        const authoredSrc = html.match(/<img[^>]*\ssrc="([^"]*\{\{ photo\.id \}\}[^"]*)"/)?.[1];
        if (!authoredSrc) {
            throw new Error("Dynamic gallery image source is missing");
        }
        const image = new TestElement({
            src: authoredSrc,
            "data-source-width": "{{ photo.width }}",
            "data-source-height": "{{ photo.height }}",
            "data-source-image-access": "public",
            loading: "lazy",
        });
        const root = {
            querySelectorAll(selector: string): TestElement[] {
                return selector === "img,picture,source" ? [image] : [];
            },
        };

        prepareNetworkInertBindings(root as unknown as ParentNode);
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toContain("{{ photo.id }}");

        image.setAttribute("data-cms-src", "/.cms/sources/photo-albums/publicPhoto?id=17");
        image.setAttribute("data-source-width", "1600");
        image.setAttribute("data-source-height", "1067");
        expect(syncResponsiveSourceImageElement(image as unknown as HTMLImageElement)).toBe(true);
        expect(image.getAttribute("srcset")).toContain("cms-width=1024 1024w");
        expect(image.getAttribute("sizes")).toBe("auto, 100vw");
        expect(image.getAttribute("width")).toBe("1600");
        expect(image.getAttribute("height")).toBe("1067");
    });
});
