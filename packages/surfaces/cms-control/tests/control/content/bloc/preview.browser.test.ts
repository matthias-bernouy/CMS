import { expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { InMemoryCache } from "@bernouy/http-runner";
import { chromium } from "playwright";
import type { ControlCms } from "cms-control/ControlCms";
import getBlocPreview from "cms-control/api/_content/bloc/preview.get";
import { siteBlocHarness } from "../../site-blocs/fixtures";

test("a real compiled bloc renders in a sandbox while fetches, forms and parent access are blocked", async () => {
    const { repository } = siteBlocHarness();
    await repository.updateSystem({
        theme: {
            activeThemeId: "preview",
            sources: [
                {
                    id: "preview",
                    label: "Preview",
                    supportsModes: false,
                    categories: [
                        {
                            id: "colors",
                            label: "Colors",
                            description: "",
                            tokens: [
                                {
                                    id: "accent",
                                    variable: "preview-accent",
                                    label: "Accent",
                                    description: "",
                                    type: "color",
                                },
                            ],
                        },
                    ],
                },
            ],
            themes: [{ id: "preview", name: "Preview", values: { light: { accent: "rgb(12, 34, 56)" }, dark: {} } }],
        },
    });
    const artifact = await prepare_bloc(
        new File([viewSource], "Bloc.ts"),
        null,
        "Preview fixture",
        "Test",
        "",
        "preview-fixture",
    );
    await repository.createBloc({
        ...artifact,
        source: {
            "manifest.json": btoa(JSON.stringify({ defaultContent: "default.html" })),
            "default.html": btoa(
                '<preview-fixture><h2>Installed sample</h2><form action="/mutation/form" method="post"></form><img src="/dynamic/{{ item.image }}"></preview-fixture>',
            ),
        },
    });
    const cms = { repository, cache: new InMemoryCache(), config: {} } as unknown as ControlCms;
    const unexpected: string[] = [];
    const server = Bun.serve({
        port: 0,
        async fetch(req) {
            const path = new URL(req.url).pathname;
            if (path === "/") {
                return new Response(
                    '<iframe title="Preview" sandbox="allow-scripts" src="/cms/api/bloc/preview?id=preview-fixture"></iframe>',
                    {
                        headers: {
                            "Content-Type": "text/html",
                            "Set-Cookie": "preview-session=authorized; Path=/; HttpOnly; SameSite=Lax",
                        },
                    },
                );
            }
            if (path.startsWith("/cms/") && !req.headers.get("cookie")?.includes("preview-session=authorized")) {
                unexpected.push(`Unauthorized ${path}`);
                return new Response("Unauthorized", { status: 401 });
            }
            if (path === "/cms/api/bloc/preview") {
                return getBlocPreview(req, cms);
            }
            if (path !== "/favicon.ico") {
                unexpected.push(`${req.method} ${path}`);
            }
            return new Response("Unexpected request", { status: 404 });
        },
    });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(server.url.toString());
        const frame = page.frames().find((candidate) => candidate.url().includes("/api/bloc/preview"))!;
        await frame.waitForFunction(
            () => document.querySelector("preview-fixture")?.getAttribute("data-fetch-blocked") === "true",
        );
        const host = frame.locator("preview-fixture");
        expect(await host.locator("h2").textContent()).toBe("Installed sample");
        expect(await host.locator("article").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
            "rgb(12, 34, 56)",
        );
        expect(await host.getAttribute("data-parent-blocked")).toBe("true");
        expect(await host.getAttribute("data-form-attempted")).toBe("true");
        expect(await host.locator("img").getAttribute("src")).toBeNull();
        expect(await frame.locator("[cms-binding-disabled][inert]").count()).toBe(1);
        expect(unexpected).toEqual([]);
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
        server.stop(true);
    }
}, 30_000);

const viewSource = `
import { Component } from "@bernouy/components/base";
export class Bloc extends Component {
    constructor() {
        super({ template: "<article><slot></slot></article>", css: "article { display: block; padding: 24px; background: var(--preview-accent); }" });
    }
    connectedCallback() {
        fetch("/mutation/fetch", { method: "POST" }).catch(() => this.dataset.fetchBlocked = "true");
        try { parent.document.body.dataset.mutated = "true"; } catch { this.dataset.parentBlocked = "true"; }
        this.querySelector("form").submit();
        this.dataset.formAttempted = "true";
    }
}`;
