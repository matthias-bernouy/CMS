import { describe, expect, test } from "bun:test";
import "../coordinatorDom";
import { createRoot, image, install, settle } from "./fixture";

describe("bound image runtime routing in an isolated DOM fixture", () => {
    test("responsive-activates an initial same-origin Source image", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-src": "/tenant/.cms/sources/catalog/image?id=7",
            "data-source-width": "900",
            "data-source-height": "600",
            loading: "lazy",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("src")).toBe("/tenant/.cms/sources/catalog/image?id=7");
        expect(element.getAttribute("srcset")).toContain("cms-width=768 768w");
        expect(element.getAttribute("sizes")).toBe("auto, 100vw");
        runtime.disconnect();
    });

    test("supports the historical data-src contract", async () => {
        const root = createRoot();
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=legacy",
            "data-source-width": "512",
            "data-source-height": "384",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("srcset")).toContain("cms-width=512 512w");
        runtime.disconnect();
    });

    test.each([
        ["same-origin non-Source", "/assets/photo.jpg?cms-width=128#hero", "/assets/photo.jpg#hero"],
        [
            "cross-origin Source-shaped URL",
            "https://images.example/.cms/sources/catalog/image?id=7&cms-width=128",
            "https://images.example/.cms/sources/catalog/image?id=7",
        ],
    ])("activates the original for a %s", async (_label, boundSrc, expectedSrc) => {
        const root = createRoot();
        const element = image({
            "data-cms-src": boundSrc,
            "data-source-width": "900",
            "data-source-height": "600",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("src")).toBe(expectedSrc);
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.hasAttribute("sizes")).toBe(false);
        runtime.disconnect();
    });

    test("prefers data-cms-src over a legacy value", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-src": "/assets/canonical.jpg",
            "data-src": "/.cms/sources/catalog/image?id=legacy",
            "data-source-width": "900",
            "data-source-height": "600",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("src")).toBe("/assets/canonical.jpg");
        expect(element.hasAttribute("srcset")).toBe(false);
        runtime.disconnect();
    });

    test("restores authored dimensions before activating an external original", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-network-inert": "",
            "data-cms-src": "https://images.example/photo.jpg",
            "data-cms-width": "640",
            "data-cms-height": "480",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("width")).toBe("640");
        expect(element.getAttribute("height")).toBe("480");
        expect(element.getAttribute("src")).toBe("https://images.example/photo.jpg");
        expect(element.hasAttribute("srcset")).toBe(false);
        runtime.disconnect();
    });

    test("restores an authored img srcset before its fallback src", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-network-inert": "",
            "data-cms-src": "/assets/fallback.jpg",
            "data-cms-srcset": "/assets/small.webp 320w, /assets/large.webp 1280w",
            "data-cms-sizes": "50vw",
        });
        root.append(element);
        const runtime = install(root);

        await settle();

        expect(element.getAttribute("sizes")).toBe("50vw");
        expect(element.getAttribute("srcset")).toContain("/assets/large.webp 1280w");
        expect(element.getAttribute("src")).toBe("/assets/fallback.jpg");
        expect(element.getAttribute("srcset")).not.toContain("cms-width");
        runtime.disconnect();
    });

    test("passes public/private rollout policy through the supplied API", async () => {
        const root = createRoot();
        const publicImage = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=public",
            "data-source-width": "800",
            "data-source-height": "600",
            "data-source-image-access": "public",
        });
        const privateImage = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=private",
            "data-source-width": "800",
            "data-source-height": "600",
        });
        root.append(publicImage, privateImage);
        const runtime = install(root, { public: false, private: true });

        await settle();

        expect(publicImage.hasAttribute("srcset")).toBe(false);
        expect(publicImage.getAttribute("src")).toContain("id=public");
        expect(privateImage.getAttribute("srcset")).toContain("cms-width");
        runtime.disconnect();
    });
});
