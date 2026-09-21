import { afterEach, expect, test } from "bun:test";
import type { P9rInput } from "@bernouy/components";
import "cms-control/components";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});

test("an unfinished save cannot replace or block a newly bound page", async () => {
    const writes: string[] = [];
    let releaseFirstSave: (response: Response) => void = () => {};
    const firstSave = new Promise<Response>((resolve) => {
        releaseFirstSave = resolve;
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input instanceof Request ? input.url : input), document.baseURI);
        if (url.pathname === "/api/page/seo") {
            return Response.json({
                id: url.searchParams.get("id"),
                defaults: { title: "Page", description: "" },
                languages: ["fr"],
                translations: {},
            });
        }
        if (url.pathname === "/api/page/exists") {
            return Response.json({ exists: false });
        }
        const id = url.searchParams.get("id") ?? "";
        if (init?.method === "PUT") {
            writes.push(id);
            if (id === "page-1") {
                return firstSave;
            }
            return Response.json(detail(id, "/second-new"));
        }
        return Response.json(detail(id, id === "page-1" ? "/first" : "/second"));
    }) as typeof fetch;

    const matrix = document.createElement("cms-page-languages");
    matrix.setAttribute("page-id", "page-1");
    document.body.append(matrix);
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/first");
    changePath(matrix, "/first-new");
    await waitFor(() => writes.length === 1);

    matrix.setAttribute("page-id", "page-2");
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/second");
    changePath(matrix, "/second-new");
    await waitFor(() => writes.length === 2);
    await waitFor(() => matrix.querySelector(".page-languages-status")?.textContent === "Language changes saved.");

    releaseFirstSave(Response.json(detail("page-1", "/first-new")));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toEqual(["page-1", "page-2"]);
    expect(matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value).toBe("/second-new");
    expect(matrix.querySelector(".page-language-old-value")?.textContent).toBe("/second-new");
});

test("the language editor explains a concurrent save without discarding the draft", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input instanceof Request ? input.url : input), document.baseURI);
        if (url.pathname === "/api/page/seo") {
            return Response.json({
                id: "page-1",
                defaults: { title: "Page", description: "" },
                languages: ["fr"],
                translations: {},
            });
        }
        if (url.pathname === "/api/page/exists") {
            return Response.json({ exists: false });
        }
        if (init?.method === "PUT") {
            return Response.json({ code: "page_path_update_in_progress" }, { status: 409 });
        }
        return Response.json(detail("page-1", "/before"));
    }) as typeof fetch;
    const matrix = document.createElement("cms-page-languages");
    matrix.setAttribute("page-id", "page-1");
    document.body.append(matrix);
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/before");
    changePath(matrix, "/draft");

    await waitFor(() => (matrix.querySelector('[role="alert"]')?.textContent ?? "").includes("Reopen Languages"));
    expect(matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value).toBe("/draft");
    expect(matrix.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(false);
});

test("reopening Languages reloads paths after another editor changes them", async () => {
    let current = "/before";
    let reads = 0;
    const expectedPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input instanceof Request ? input.url : input), document.baseURI);
        if (url.pathname === "/api/page/seo") {
            return Response.json({
                id: "page-1",
                defaults: { title: "Page", description: "" },
                languages: ["fr"],
                translations: {},
            });
        }
        if (url.pathname === "/api/page/exists") {
            return Response.json({ exists: false });
        }
        if (init?.method === "PUT") {
            const body = JSON.parse(String(init.body)) as {
                paths: Record<string, string>;
                expectedPaths: Record<string, string>;
            };
            expectedPaths.push(body.expectedPaths.fr!);
            if (body.expectedPaths.fr !== current) {
                return Response.json({ code: "page_paths_changed" }, { status: 409 });
            }
            current = body.paths.fr!;
            return Response.json(detail("page-1", current));
        }
        reads += 1;
        return Response.json(detail("page-1", current));
    }) as typeof fetch;

    const modal = document.createElement("p9r-modal");
    const matrix = document.createElement("cms-page-languages");
    matrix.setAttribute("page-id", "page-1");
    modal.append(matrix);
    document.body.append(modal);
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/before");
    modal.setAttribute("open", "");
    await waitFor(() => reads >= 2);
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/before");

    current = "/other-editor";
    changePath(matrix, "/draft");
    await waitFor(() => (matrix.querySelector('[role="alert"]')?.textContent ?? "").includes("Reopen Languages"));
    expect(matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value).toBe("/draft");

    modal.removeAttribute("open");
    modal.setAttribute("open", "");
    await waitFor(() => matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value === "/other-editor");
    changePath(matrix, "/after");
    await waitFor(() => matrix.querySelector(".page-languages-status")?.textContent === "Language changes saved.");
    expect(expectedPaths).toEqual(["/before", "/other-editor"]);
});

function detail(id: string, path: string) {
    return {
        id,
        paths: { fr: path },
        languages: [{ code: "fr", default: true, active: true, publicPath: path }],
    };
}

function changePath(matrix: HTMLElement, path: string): void {
    const input = matrix.querySelector<P9rInput>('p9r-input[name="fr"]')!;
    input.value = path;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    matrix.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("UI state did not settle.");
}
