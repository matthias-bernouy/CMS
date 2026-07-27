import { afterEach, describe, expect, test } from "bun:test";
import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { BrowserWindow, GlobalWindow } from "happy-dom";
import "cms-control/components/editorSystemV2/siteBloc/SiteBlocBuilder";

const realFetch = globalThis.fetch;

// Happy DOM's iframe windows omit native error constructors unless registered globally.
Object.defineProperty(BrowserWindow.prototype, "SyntaxError", { configurable: true, value: SyntaxError });

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    document.head.querySelectorAll("[data-editor-catalog-script]").forEach((element) => element.remove());
});

describe("site bloc builder", () => {
    test("saves the active mode before loading a revision-pinned unique preview", async () => {
        const requests: Array<{ url: string; method: string }> = [];
        let definition = siteDefinition();
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            requests.push({ url, method });
            if (url.includes("/api/site-bloc?") && method === "PUT") {
                definition = { ...definition, draftRevision: definition.draftRevision + 1 };
                return Response.json(definition);
            }
            if (url.includes("/api/site-bloc?") && method === "PATCH") {
                definition = { ...definition, lifecycle: "archived" };
                return Response.json(definition);
            }
            if (url.includes("/api/site-bloc?")) {
                return Response.json(definition);
            }
            if (url.includes("/api/bloc/catalogue")) {
                return Response.json([]);
            }
            if (url.includes("/api/template/list") || url.includes("/api/editor/sources")) {
                return Response.json([]);
            }
            if (url.includes("/api/system/settings")) {
                return Response.json({});
            }
            return new Response("<!doctype html><html><body></body></html>", {
                headers: { "content-type": "text/html" },
            });
        }) as typeof fetch;
        const script = document.createElement("script");
        script.dataset.editorCatalogScript = "/api/editor/script.js";
        document.head.append(script);
        const builder = document.createElement("cms-site-bloc-builder");
        builder.setAttribute("bloc-id", "site-card");
        document.body.append(builder);
        await waitFor(() => builder.shadowRoot?.querySelector("[data-name]")?.textContent === "Site card");

        const shell = builder.shadowRoot!.querySelector("cms-editor-shell")!;
        const canvas = shell.shadowRoot!.querySelector("cms-editor-v2-canvas")!;
        const initialEditorUrl = canvas.getAttribute("editor-frame-url");
        const frameWindow = new GlobalWindow({ url: "http://localhost/editor-frame" });
        const frameDocument = frameWindow.document;
        frameDocument.title = "Structure";
        frameDocument.body.innerHTML = "<main data-cms-editor-root data-cms-content></main>";
        canvas.dispatchEvent(
            new CustomEvent("editor-v2:frame-ready", {
                bubbles: true,
                composed: true,
                detail: {
                    document: frameDocument,
                    frame: document.createElement("iframe"),
                    kind: "editor",
                    url: canvas.getAttribute("editor-frame-url"),
                },
            }),
        );
        builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
        await waitFor(() => requests.some((request) => request.method === "PUT"));
        await waitFor(() => shell.hasAttribute("view-mode"));

        expect(requests.filter((request) => request.method !== "GET").map((request) => request.method)).toEqual([
            "PUT",
        ]);
        const previewUrl = new URL(canvas.getAttribute("view-frame-url")!, "http://localhost");
        expect(previewUrl.searchParams.get("mode")).toBe("preview");
        expect(previewUrl.searchParams.get("revision")).toBe("2");
        expect(previewUrl.searchParams.get("nonce")).not.toBeNull();

        const previewWindow = new GlobalWindow({ url: "http://localhost/preview-frame" });
        const previewDocument = previewWindow.document;
        previewDocument.title = "Preview";
        previewDocument.body.innerHTML = '<main><img src="missing.webp"><button></button></main>';
        canvas.dispatchEvent(
            new CustomEvent("editor-v2:frame-ready", {
                bubbles: true,
                composed: true,
                detail: {
                    document: previewDocument,
                    frame: document.createElement("iframe"),
                    kind: "view",
                    url: canvas.getAttribute("view-frame-url"),
                },
            }),
        );
        expect(builder.shadowRoot!.querySelector("[data-a11y-summary]")?.textContent).toBe("2 potential issues.");

        canvas.dispatchEvent(
            new CustomEvent("editor-v2:frame-ready", {
                bubbles: true,
                composed: true,
                detail: {
                    document: frameDocument,
                    frame: document.createElement("iframe"),
                    kind: "editor",
                    url: initialEditorUrl,
                },
            }),
        );
        expect(builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="archive"]')?.disabled).toBe(true);
        canvas.dispatchEvent(
            new CustomEvent("editor-v2:frame-ready", {
                bubbles: true,
                composed: true,
                detail: {
                    document: frameDocument,
                    frame: document.createElement("iframe"),
                    kind: "editor",
                    url: canvas.getAttribute("editor-frame-url"),
                },
            }),
        );
        builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="archive"]')!.click();
        await waitFor(
            () =>
                builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="archive"]')?.textContent ===
                "Restore",
        );
        expect(builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="archive"]')?.disabled).toBe(false);
        expect(builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(true);
        expect(builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-mode="structure"]')?.disabled).toBe(true);
        frameWindow.close();
        previewWindow.close();
    });
});

function siteDefinition(): SiteBlocDefinition {
    const now = new Date("2026-07-27T10:00:00.000Z");
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-card",
        tag: "site-card",
        ownership: { kind: "site-builder", definitionId: "definition-card" },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft: {
            name: "Site card",
            group: "Site",
            description: "A site card",
            structure: [],
            slots: [],
            defaultContent: "",
            dependencies: [],
        },
        published: null,
        createdAt: now,
        updatedAt: now,
    };
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for site bloc builder state");
}
