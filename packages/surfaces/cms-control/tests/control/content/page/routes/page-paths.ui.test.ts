import { afterEach, expect, test } from "bun:test";
import type { P9rInput, P9rSelect } from "@bernouy/components";
import "cms-control/components";
import { languageRows } from "cms-control/components/admin/Common/PageSettings/languages/manage/languageRows";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});

test("the language editor shows the lowercase public prefix for a regional language", () => {
    const [row] = languageRows(
        { code: "en-US", default: false, active: true, publicPath: "" },
        { id: "page-1", paths: {}, languages: [] },
        { id: "page-1", defaults: { title: "", description: "" }, languages: [], translations: {} },
        false,
    );
    expect(row.querySelector("p9r-input")?.getAttribute("prefix")).toBe("/en-us");
});

test("language matrix saves local paths and reports a reserved URL", async () => {
    const writes: Record<string, unknown>[] = [];
    let collision = false;
    let saved = 0;
    const detail: {
        id: string;
        paths: Record<string, string>;
        languages: Array<{ code: string; default: boolean; active: boolean; publicPath: string }>;
    } = {
        id: "page-1",
        paths: { fr: "/about" },
        languages: [
            { code: "fr", default: true, active: true, publicPath: "/about" },
            { code: "en", default: false, active: true, publicPath: "" },
        ],
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/page/seo")) {
            return Response.json({
                id: "page-1",
                defaults: { title: "About", description: "" },
                languages: ["fr", "en"],
                translations: {},
            });
        }
        if (url.includes("/api/page/exists")) {
            return Response.json({ exists: collision });
        }
        if (init?.method === "PUT") {
            const body = JSON.parse(String(init.body)) as { paths: Record<string, string> };
            writes.push(body);
            detail.paths = body.paths;
            detail.languages[1]!.publicPath = body.paths.en ? `/en${body.paths.en}` : "";
            return Response.json(detail);
        }
        return Response.json(detail);
    }) as typeof fetch;
    document.addEventListener("page:paths-saved", onSaved);
    const matrix = document.createElement("cms-page-languages");
    matrix.setAttribute("page-id", "page-1");
    document.body.append(matrix);
    await waitFor(() => matrix.querySelector('p9r-input[name="en"]') !== null);
    expect(matrix.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(true);
    expect(Array.from(matrix.querySelectorAll("th")).map((heading) => heading.textContent)).toEqual([
        "Language",
        "Current URL",
        "New URL",
    ]);
    expect(matrix.querySelector(".page-language-row .page-language-old-value")?.textContent).toBe("/about");
    expect(
        matrix.querySelectorAll(".page-language-row")[1]?.querySelector(".page-language-old-value")?.textContent,
    ).toBe("No URL yet");
    expect(matrix.querySelector('p9r-input[name="en"]')?.getAttribute("prefix")).toBe("/en");
    expect(matrix.querySelector<P9rInput>('p9r-input[name="fr"]')?.value).toBe("/about");
    const en = matrix.querySelector<P9rInput>('p9r-input[name="en"]')!;
    en.value = "/about";
    en.dispatchEvent(new Event("input", { bubbles: true }));
    expect(matrix.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(false);
    expect(en.closest(".page-language-row")?.querySelector(".page-language-old-value")?.textContent).toBe("No URL yet");
    expect(en.value).toBe("/about");
    matrix.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => saved === 1);
    expect(writes).toEqual([{ paths: { fr: "/about", en: "/about" }, expectedPaths: { fr: "/about" } }]);
    expect(matrix.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(true);
    expect(
        matrix.querySelectorAll(".page-language-row")[1]?.querySelector(".page-language-old-value")?.textContent,
    ).toBe("/en/about");

    collision = true;
    const updated = matrix.querySelector<P9rInput>('p9r-input[name="en"]')!;
    updated.value = "/taken";
    updated.dispatchEvent(new Event("input", { bubbles: true }));
    matrix.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => (updated.getAttribute("error") ?? "").includes("reserved"));
    expect(writes).toHaveLength(1);
    expect(matrix.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(false);
    document.removeEventListener("page:paths-saved", onSaved);

    function onSaved() {
        saved += 1;
    }
});

test("language matrix loads after a bound page ID becomes available", async () => {
    const requestedIds: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input instanceof Request ? input.url : input), document.baseURI);
        if (url.pathname === "/detail") {
            return Response.json({ id: "page-1" });
        }
        if (url.pathname === "/cms/api/page/seo") {
            return Response.json({
                id: "page-1",
                defaults: { title: "About", description: "" },
                languages: ["fr"],
                translations: {},
            });
        }
        if (url.pathname === "/cms/api/page/paths") {
            const id = url.searchParams.get("id") ?? "";
            requestedIds.push(id);
            return id === "page-1"
                ? Response.json({
                      id,
                      paths: { fr: "/about" },
                      languages: [{ code: "fr", default: true, active: true, publicPath: "/about" }],
                  })
                : new Response("Unknown page", { status: 400 });
        }
        return new Response("Not found", { status: 404 });
    }) as typeof fetch;
    document.body.innerHTML = `<cms-binding-core><div cms-source="/detail"><template><cms-page-languages page-id="{{ id }}" base-path="/cms"></cms-page-languages></template></div></cms-binding-core>`;
    await waitFor(() => document.querySelector("cms-page-languages") !== null);
    await waitFor(() => document.querySelector("cms-page-languages")?.getAttribute("page-id") === "page-1");
    expect(requestedIds).toEqual(["page-1"]);
    await waitFor(() => document.querySelector('cms-page-languages p9r-input[name="fr"]') !== null);
});

test("delete panel waits for alternatives and sends the selected page ID", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (init?.method === "DELETE") {
            requests.push(url);
            return new Response("Failed", { status: 500 });
        }
        return Response.json([
            { id: "page-1", title: "Current", path: "/fr/current" },
            { id: "page-2", title: "Replacement", path: "/fr/replacement" },
        ]);
    }) as typeof fetch;
    const panel = document.createElement("cms-page-delete");
    panel.setAttribute("page-id", "page-1");
    document.body.append(panel);
    await waitFor(() => panel.querySelectorAll("p9r-select option").length === 2);
    const select = panel.querySelector<P9rSelect>("p9r-select")!;
    expect(Array.from(select.querySelectorAll("option")).map((option) => option.value)).toEqual(["", "page-2"]);
    select.value = "page-2";
    panel.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => requests.length === 1);
    expect(new URL(requests[0]!, document.baseURI).searchParams.get("alternativeId")).toBe("page-2");
    await waitFor(() => (panel.querySelector('[role="alert"]')?.textContent ?? "").includes("Could not delete"));
    expect(panel.querySelector("p9r-button")?.hasAttribute("disabled")).toBe(false);
});

test("delete panel excludes its own page when the page ID is bound later", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input instanceof Request ? input.url : input), document.baseURI);
        if (url.pathname === "/detail") {
            return Response.json({ id: "page-1" });
        }
        if (url.pathname === "/cms/api/page/list") {
            return Response.json([
                { id: "page-1", title: "Current", path: "/fr/current" },
                { id: "page-2", title: "Replacement", path: "/fr/replacement" },
            ]);
        }
        return new Response("Not found", { status: 404 });
    }) as typeof fetch;
    document.body.innerHTML = `<cms-binding-core><div cms-source="/detail"><template><cms-page-delete page-id="{{ id }}" base-path="/cms"></cms-page-delete></template></div></cms-binding-core>`;
    await waitFor(() => document.querySelector("cms-page-delete")?.getAttribute("page-id") === "page-1");
    await waitFor(() => document.querySelectorAll("cms-page-delete p9r-select option").length === 2);
    const options = document.querySelectorAll("cms-page-delete p9r-select option");
    expect(Array.from(options).map((option) => (option as HTMLOptionElement).value)).toEqual(["", "page-2"]);
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("UI state did not settle.");
}
