import { afterEach, expect, test } from "bun:test";
import type { P9rInput, Textarea } from "@bernouy/components";
import "cms-control/components";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});

test("expanded language SEO saves overrides and shows page values as placeholders", async () => {
    const writes: Array<Record<string, { title?: string; description?: string }>> = [];
    const seo = {
        id: "page-1",
        defaults: { title: "À propos", description: "Notre entreprise" },
        languages: ["fr", "en"],
        translations: { fr: {}, en: {} as { title?: string; description?: string } },
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/page/paths")) {
            return Response.json({
                id: "page-1",
                paths: { fr: "/a-propos", en: "/about" },
                languages: [
                    { code: "fr", default: true, active: true, publicPath: "/a-propos" },
                    { code: "en", default: false, active: true, publicPath: "/en/about" },
                ],
            });
        }
        if (init?.method === "PUT") {
            const body = JSON.parse(String(init.body)) as { translations: typeof seo.translations };
            writes.push(body.translations);
            seo.translations = { fr: body.translations.fr ?? {}, en: body.translations.en ?? {} };
        }
        return Response.json(seo);
    }) as typeof fetch;
    const panel = document.createElement("cms-page-languages");
    panel.setAttribute("page-id", "page-1");
    document.body.append(panel);
    await waitFor(() => panel.querySelector<P9rInput>('p9r-input[name="en.title"]') !== null);
    const toggle = panel.querySelectorAll<HTMLButtonElement>(".page-language-toggle")[1]!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelector('p9r-input[name="en.title"]')?.getAttribute("placeholder")).toBe("À propos");
    expect(panel.querySelector('p9r-textarea[name="en.description"]')?.getAttribute("placeholder")).toBe(
        "Notre entreprise",
    );
    const title = panel.querySelector<P9rInput>('p9r-input[name="en.title"]')!;
    const description = panel.querySelector<Textarea>('p9r-textarea[name="en.description"]')!;
    title.value = "About us";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    description.value = "Our company";
    description.dispatchEvent(new Event("input", { bubbles: true }));
    submit(panel);
    await waitFor(() => writes.length === 1 && panel.querySelector(".page-languages-status")?.textContent !== "");
    expect(writes[0]).toEqual({ en: { title: "About us", description: "Our company" } });
    expect(panel.querySelectorAll<HTMLButtonElement>(".page-language-toggle")[1]?.getAttribute("aria-expanded")).toBe(
        "true",
    );

    const savedTitle = panel.querySelector<P9rInput>('p9r-input[name="en.title"]')!;
    savedTitle.value = "";
    savedTitle.dispatchEvent(new Event("input", { bubbles: true }));
    expect(savedTitle.getAttribute("placeholder")).toBe("À propos");
    submit(panel);
    await waitFor(() => writes.length === 2);
    expect(writes[1]).toEqual({ en: { description: "Our company" } });
});

test("URL success followed by SEO failure keeps the draft available for retry", async () => {
    const paths = {
        id: "page-1",
        paths: { fr: "/before" } as Record<string, string>,
        languages: [
            { code: "fr", default: true, active: true, publicPath: "/before" },
            { code: "en", default: false, active: true, publicPath: "" },
        ],
    };
    const seo = {
        id: "page-1",
        defaults: { title: "Before", description: "" },
        languages: ["fr", "en"],
        translations: {} as Record<string, { title?: string }>,
    };
    const writes: string[] = [];
    let failSeo = true;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/page/exists")) {
            return Response.json({ exists: false });
        }
        if (url.includes("/api/page/paths")) {
            if (init?.method === "PUT") {
                writes.push("paths");
                paths.paths = (JSON.parse(String(init.body)) as typeof paths).paths;
                paths.languages[1]!.publicPath = `/en${paths.paths.en}`;
            }
            return Response.json(paths);
        }
        if (init?.method === "PUT") {
            writes.push("seo");
            if (failSeo) {
                return new Response("Failed", { status: 500 });
            }
            seo.translations = (
                JSON.parse(String(init.body)) as { translations: typeof seo.translations }
            ).translations;
        }
        return Response.json(seo);
    }) as typeof fetch;
    const panel = document.createElement("cms-page-languages");
    panel.setAttribute("page-id", "page-1");
    document.body.append(panel);
    await waitFor(() => panel.querySelector<P9rInput>('p9r-input[name="fr"]') !== null);
    setValue(panel.querySelector<P9rInput>('p9r-input[name="en"]')!, "/after");
    setValue(panel.querySelector<P9rInput>('p9r-input[name="en.title"]')!, "After");
    submit(panel);
    await waitFor(() => writes.length === 2 && !!panel.querySelector(".page-languages-error")?.textContent);
    expect(panel.querySelector(".page-languages-error")?.textContent).toContain("URLs saved");
    expect(panel.querySelectorAll(".page-language-old-value")[1]?.textContent).toBe("/en/after");
    expect(panel.querySelector<P9rInput>('p9r-input[name="en.title"]')?.value).toBe("After");
    failSeo = false;
    submit(panel);
    await waitFor(() => panel.querySelector(".page-languages-status")?.textContent === "Language changes saved.");
    expect(writes).toEqual(["paths", "seo", "seo"]);
});

function setValue(input: P9rInput, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function submit(panel: HTMLElement): void {
    panel.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
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
