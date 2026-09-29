import { expect, test } from "bun:test";
import {
    buildProviderImageAttributes,
    PROVIDER_IMAGE_WIDTHS,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/media/browser";

test("provider media URLs become bounded derivative candidates", () => {
    const attributes = buildProviderImageAttributes({
        url: "/tenant/.cms/media/catalog/photo.read/item%2Fone",
        width: 900,
        height: 600,
        loading: "lazy",
        baseURI: "https://site.example/tenant/",
    });
    expect(attributes).toMatchObject({
        src: "/tenant/.cms/media/catalog/photo.read/item%2Fone",
        sizes: "auto, 100vw",
        width: 900,
        height: 600,
    });
    expect(attributes?.srcset).toContain("/tenant/.cms/image/catalog/photo.read/item%2Fone/768.webp 768w");
    expect(attributes?.srcset).not.toContain("1024.webp");
    expect(PROVIDER_IMAGE_WIDTHS).toContain(768);
});

test("provider media candidates reject external, unresolved and malformed URLs", () => {
    for (const url of [
        "https://other.example/.cms/media/catalog/photo.read/file",
        "/.cms/sources/catalog/photo",
        "/.cms/media/catalog/photo.read/{{ fileId }}",
        "/.cms/media/catalog/photo.read/file?cms-width=512",
    ]) {
        expect(
            buildProviderImageAttributes({ url, width: 900, height: 600, baseURI: "https://site.example/" }),
        ).toBeNull();
    }
    expect(buildProviderImageAttributes({ url: "/.cms/media/c/p/f", width: 0, height: 600 })).toBeNull();
});

test("bound provider image updates candidates and restores authored attributes", () => {
    const image = document.createElement("img");
    image.setAttribute("src", "/placeholder.png");
    image.setAttribute("width", "900");
    image.setAttribute("data-cms-src", "/.cms/media/catalog/photo.read/first");
    image.setAttribute("data-source-width", "800");
    image.setAttribute("data-source-height", "600");
    syncProviderMediaImage(image);
    expect(image.getAttribute("srcset")).toContain("/.cms/image/catalog/photo.read/first/768.webp 768w");
    image.setAttribute("data-cms-src", "/.cms/media/catalog/photo.read/second");
    syncProviderMediaImage(image);
    expect(image.getAttribute("srcset")).toContain("/.cms/image/catalog/photo.read/second/768.webp 768w");
    image.setAttribute("data-cms-src", "{{ unresolved }}");
    syncProviderMediaImage(image);
    expect(image.getAttribute("src")).toBe("/placeholder.png");
    expect(image.getAttribute("width")).toBe("900");
    expect(image.hasAttribute("srcset")).toBe(false);
    image.setAttribute("data-cms-src", "/.cms/media/catalog/photo.read/third");
    syncProviderMediaImage(image);
    image.removeAttribute("data-cms-src");
    syncProviderMediaImage(image);
    expect(image.getAttribute("src")).toBe("/placeholder.png");
});

test("image activation leaves external sources inert and retains CMS file fallbacks", () => {
    const image = document.createElement("img");
    image.setAttribute("data-cms-src", "https://other.example/tracker.png");
    image.setAttribute("data-cms-width", "800");
    image.setAttribute("data-cms-height", "600");
    syncProviderMediaImage(image);
    expect(image.hasAttribute("src")).toBe(false);

    image.setAttribute("data-cms-src", "/.cms/files/by-id/photo-1");
    syncProviderMediaImage(image);
    expect(image.getAttribute("src")).toBe("/.cms/files/by-id/photo-1");
    expect(image.hasAttribute("srcset")).toBe(false);
});

test("unresolved provider sizes do not activate an image URL", () => {
    const image = document.createElement("img");
    image.setAttribute("data-cms-src", "/.cms/media/catalog/photo.read/file");
    image.setAttribute("data-cms-width", "800");
    image.setAttribute("data-cms-height", "600");
    image.setAttribute("data-cms-sizes", "{{ layout.sizes }}");
    syncProviderMediaImage(image);
    expect(image.hasAttribute("src")).toBe(false);
    expect(image.hasAttribute("srcset")).toBe(false);
});
