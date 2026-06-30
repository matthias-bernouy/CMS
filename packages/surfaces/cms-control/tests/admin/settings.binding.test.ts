import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "cms-control/components";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("admin settings binding", () => {
    test("renders the settings forms from the loaded settings source", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/system/settings")) {
                return json({
                    site: {
                        name:        "Demo",
                        host:        "https://example.com",
                        favicon:     "",
                        language:    "",
                        notFound:    { path: "" },
                        serverError: { path: "" },
                        theme:       "",
                    },
                    editor: { layoutCategory: "" },
                    security: {},
                    email: {
                        enabled:   true,
                        transport: "smtp",
                        fromEmail: "",
                        fromName:  "",
                        replyTo:   "",
                        smtp:      {
                            host:              "",
                            port:              587,
                            secure:            false,
                            username:          "",
                            passwordSecretRef: "",
                        },
                        templates: {
                            emailVerification: { subject: "", html: "" },
                            passwordReset:     { subject: "", html: "" },
                        },
                    },
                    pages:            [{ path: "/404", title: "Not found" }],
                    layoutCategories: ["Layouts"],
                });
            }
            if (href.includes("/api/identity/providers")) return json([]);
            if (href.includes("/api/secrets")) return json([]);
            return json({});
        }) as typeof fetch;

        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml()}
            </cms-binding-core>
        `;

        await waitFor(() => document.querySelector("#settings-form") !== null);

        expect(document.querySelector("#settings-form")).not.toBeNull();
        expect(document.querySelectorAll("p9r-card").length).toBeGreaterThan(0);
        expect(document.querySelector("p9r-input[name='site.name']")?.getAttribute("value")).toBe("Demo");
        expect(document.querySelector("p9r-select[name='site.notFound'] option[value='/404']")).not.toBeNull();
    });
});

function settingsHtml(): string {
    const path = join(import.meta.dir, "../../src/static/admin/settings.html");
    return readFileSync(path, "utf8").replaceAll("{{BASE_PATH}}", "");
}

function json(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
    });
}

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
