import { afterEach, expect, test } from "bun:test";
import "cms-control/components";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});

test("a path save still updates the detail when Languages reopens during its request", async () => {
    const paths = {
        id: "page-1",
        paths: { en: "/old" },
        languages: [{ code: "en", active: true, default: true, publicPath: "/old" }],
    };
    let enterWrite!: () => void;
    let releaseWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
        enterWrite = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseWrite = resolve;
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/page/exists")) {
            return Response.json({ exists: false });
        }
        if (url.includes("/api/page/paths")) {
            if (init?.method === "PUT") {
                enterWrite();
                await held;
                paths.paths = (JSON.parse(String(init.body)) as typeof paths).paths;
                paths.languages[0]!.publicPath = paths.paths.en;
            }
            return Response.json(structuredClone(paths));
        }
        if (url.includes("/api/page/seo")) {
            return Response.json({
                id: "page-1",
                defaultLanguage: "en",
                defaults: { title: "Old", description: "" },
                languages: ["en"],
                translations: { en: {} },
            });
        }
        throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    document.body.innerHTML = `
        <cms-page-detail-sync>
            <p9r-input name="path" value="/old" readonly></p9r-input>
            <p9r-action-menu-item data-action="view-public" href="https://site.test/old">View</p9r-action-menu-item>
            <p9r-modal><cms-page-languages page-id="page-1"></cms-page-languages></p9r-modal>
        </cms-page-detail-sync>
    `;
    await waitFor(() => document.querySelector('cms-page-languages p9r-input[name="en"]') !== null);
    const field = document.querySelector<HTMLElement & { value: string }>('cms-page-languages p9r-input[name="en"]')!;
    field.value = "/new";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    document
        .querySelector<HTMLFormElement>("cms-page-languages form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await writing;

    const modal = document.querySelector("p9r-modal")!;
    modal.dispatchEvent(new Event("open"));
    await waitFor(
        () =>
            document.querySelector<HTMLElement & { value: string }>('cms-page-languages p9r-input[name="en"]')
                ?.value === "/old",
    );
    releaseWrite();
    await waitFor(
        () => document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value === "/new",
    );
    await waitFor(
        () =>
            document.querySelector<HTMLElement & { value: string }>('cms-page-languages p9r-input[name="en"]')
                ?.value === "/new",
    );
    expect(document.querySelector('p9r-action-menu-item[data-action="view-public"]')?.getAttribute("href")).toBe(
        "https://site.test/new",
    );
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("UI state did not settle.");
}
