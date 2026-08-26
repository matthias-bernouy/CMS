import { describe, expect, test } from "bun:test";
import "../coordinatorDom";
import { createRoot, image, install, settle } from "./fixture";

describe("bound image runtime cleanup in an isolated DOM fixture", () => {
    test("cleans removed nodes and activates them again when reinserted", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=7",
            "data-source-width": "900",
            "data-source-height": "600",
        });
        root.append(element);
        const runtime = install(root);
        await settle();
        expect(element.hasAttribute("srcset")).toBe(true);

        element.remove();
        await settle();
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);

        root.append(element);
        await settle();
        expect(element.getAttribute("srcset")).toContain("cms-width");
        runtime.disconnect();
    });

    test("disconnect cancels pending work, cleans owned attributes, and is idempotent", async () => {
        const root = createRoot();
        const initial = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=initial",
            "data-source-width": "800",
            "data-source-height": "600",
        });
        root.append(initial);
        const runtime = install(root);
        await settle();
        expect(initial.hasAttribute("src")).toBe(true);

        const pending = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=pending",
            "data-source-width": "800",
            "data-source-height": "600",
        });
        root.append(pending);
        runtime.disconnect();
        runtime.disconnect();
        await settle();

        expect(initial.hasAttribute("src")).toBe(false);
        expect(initial.hasAttribute("srcset")).toBe(false);
        expect(pending.hasAttribute("src")).toBe(false);
    });

    test("does not observe its own generated attributes", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=7",
            "data-source-width": "900",
            "data-source-height": "600",
        });
        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver((records) => mutations.push(...records));
        observer.observe(element, { attributes: true });
        root.append(element);
        const runtime = install(root);
        await settle();
        const afterActivation = mutations.length;

        await settle();

        expect(mutations.length).toBe(afterActivation);
        observer.disconnect();
        runtime.disconnect();
    });
});
