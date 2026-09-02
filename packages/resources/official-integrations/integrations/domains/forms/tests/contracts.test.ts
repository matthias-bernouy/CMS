import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { restaurantPreview } from "../blocs/form-renderer/preview";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";
import { formDefinition, submissionAnswers } from "../connectors/supabase/functions/cms-forms/validation";

const versionRoot = new URL("../", import.meta.url);
const originalFetch = globalThis.fetch;

async function json(path: string): Promise<unknown> {
    return await Bun.file(new URL(path, versionRoot)).json();
}

function response(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
    Object.defineProperty(globalThis, "Deno", {
        configurable: true,
        value: {
            env: {
                get(name: string) {
                    return {
                        CMS_FORMS_API_KEY: "cms_forms_test",
                        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
                        SUPABASE_URL: "https://database.example.test",
                    }[name];
                },
            },
        },
    });
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "Deno");
});

describe("Forms 1.0.0 contracts", () => {
    test("declares the expected dependency and paired visitor endpoints", async () => {
        const dependencies = (await json("definitions/configuration/dependencies.json")) as Array<
            Record<string, string>
        >;
        const publicEndpoints = (await json("definitions/artifacts/sources/primary/endpoints/public.json")) as Array<
            Record<string, unknown>
        >;
        const authenticatedEndpoints = (await json(
            "definitions/artifacts/sources/primary/endpoints/authenticated.json",
        )) as Array<Record<string, unknown>>;

        expect(dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs", versionRange: "^1.0.0" }]);
        expect(publicEndpoints.map((endpoint) => endpoint.endpointId)).toEqual([
            "formPublic",
            "submitPublic",
            "formImagePublic",
        ]);
        expect(publicEndpoints.every((endpoint) => endpoint.access === "public")).toBe(true);
        expect(authenticatedEndpoints.map((endpoint) => endpoint.endpointId)).toEqual([
            "formAuthenticated",
            "submitAuthenticated",
            "formImageAuthenticated",
        ]);
        expect(authenticatedEndpoints.every((endpoint) => endpoint.access === "auth")).toBe(true);
    });

    test("keeps the draft definition internal to the visual builder", async () => {
        const formSchema = (await json("definitions/artifacts/sources/primary/schemas/form.json")) as Record<
            string,
            unknown
        >;
        const properties = formSchema.properties as Record<string, unknown>;

        expect(properties.draftDefinition).toEqual({ type: "object" });
        expect(properties.definitionJson).toBeUndefined();

        const managedFormSql = await Bun.file(
            new URL("connectors/supabase/install/sql/operations/form-read.sql", versionRoot),
        ).text();
        expect(managedFormSql).not.toContain("definitionJson");
    });

    test("declares dynamically created Basic Blocs for Delivery asset discovery", async () => {
        const defaultContent = await Bun.file(new URL("blocs/form-renderer/default.html", versionRoot)).text();

        for (const tag of [
            "basic-input",
            "basic-textarea",
            "basic-select",
            "basic-option",
            "basic-chip-group",
            "basic-chip",
            "basic-checkbox",
            "basic-button",
        ]) {
            expect(defaultContent).toContain(`<${tag}`);
        }
    });

    test("validates definitions and required answers before storage", () => {
        const definition = formDefinition(restaurantPreview.definition);
        expect(() => submissionAnswers(definition, {})).toThrow("some answers are invalid");
        expect(
            submissionAnswers(definition, {
                ownerName: "Alex Morgan",
                email: "alex@example.test",
                restaurantName: "Maison Sépia",
                mood: "warm",
                cuisine: "french",
                city: "Bordeaux",
                introduction: "Seasonal cooking in a warm room.",
                consent: "true",
            }),
        ).toMatchObject({ restaurantName: "Maison Sépia", consent: "true" });
    });

    test("validates stable image-choice keys and private Forms media identifiers", () => {
        const definition = structuredClone(restaurantPreview.definition) as any;
        const mood = definition.steps[1].fields[1];
        mood.presentation = "image-grid";
        mood.options = [
            { key: "warm", label: "Warm", image: { mediaId: "17", alt: "Warm room" } },
            { key: "bright", label: "Bright", image: { mediaId: "18" } },
        ];

        expect(formDefinition(definition)).toBe(definition);
        expect(
            submissionAnswers(definition, {
                ownerName: "Alex Morgan",
                email: "alex@example.test",
                restaurantName: "Maison Sépia",
                mood: "bright",
                cuisine: "french",
                city: "Bordeaux",
                consent: "true",
            }),
        ).toMatchObject({ mood: "bright" });
        mood.options[1].key = "warm";
        expect(() => formDefinition(definition)).toThrow("duplicate option keys");
        mood.options[1].key = "bright";
        mood.options[1].image.mediaId = "not-an-id";
        expect(() => formDefinition(definition)).toThrow("image choices need a Forms image");
    });

    test("serves a published form and submits through mocked PostgREST", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith("/rpc/get_published_form")) {
                return response(restaurantPreview);
            }
            if (url.endsWith("/rpc/submit_form")) {
                return response({ ok: true, receiptId: "26db71b6-1f70-4fa4-8e68-d08822f70425" });
            }
            return response({ message: "unexpected request" }, 500);
        };
        const headers = { authorization: "Bearer cms_forms_test", "content-type": "application/json" };
        const read = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/public/form?key=restaurant-onboarding", { headers }),
        );
        expect(read.status).toBe(200);
        expect((await read.json()).version).toBe(1);

        const submit = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/public/submission?key=restaurant-onboarding", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    version: 1,
                    idempotencyKey: "3ace3d28-9671-409e-a4da-36f38354f021",
                    sessionId: "74924e5f-9664-44ab-8eb0-2ed8144b90fb",
                    startedAt: new Date(Date.now() - 5000).toISOString(),
                    answers: {
                        ownerName: "Alex Morgan",
                        email: "alex@example.test",
                        restaurantName: "Maison Sépia",
                        mood: "warm",
                        cuisine: "french",
                        city: "Bordeaux",
                        consent: "true",
                    },
                }),
            }),
        );
        expect(submit.status).toBe(202);
        expect(await submit.json()).toEqual({ ok: true, receiptId: "26db71b6-1f70-4fa4-8e68-d08822f70425" });
        expect(calls.filter((url) => url.includes("/rpc/get_published_form"))).toHaveLength(2);
        expect(calls.filter((url) => url.includes("/rpc/submit_form"))).toHaveLength(1);
    });

    test("rejects requests that bypass the CMS Source credential", async () => {
        const result = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/system/health", {
                headers: { authorization: "Bearer wrong" },
            }),
        );
        expect(result.status).toBe(401);
    });
});
