import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";
import { formDefinition, submissionAnswers } from "../connectors/supabase/functions/cms-forms/validation";
import { registrationForm } from "./fixtures/registration";

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
    test("keeps paired visitor endpoints independent from a collection UI", async () => {
        const publicEndpoints = (await json("definitions/artifacts/sources/primary/endpoints/public.json")) as Array<
            Record<string, unknown>
        >;
        const authenticatedEndpoints = (await json(
            "definitions/artifacts/sources/primary/endpoints/authenticated.json",
        )) as Array<Record<string, unknown>>;

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

    test("validates definitions and required answers before storage", () => {
        const definition = formDefinition(registrationForm.definition);
        expect(() => submissionAnswers(definition, {})).toThrow("some answers are invalid");
        expect(
            submissionAnswers(definition, {
                attendeeName: "Alex Morgan",
                email: "alex@example.test",
                organization: "Example Organization",
                session: "morning",
                attendanceType: "in-person",
                city: "Bordeaux",
                notes: "Please reserve an accessible seat.",
                consent: "true",
            }),
        ).toMatchObject({ organization: "Example Organization", consent: "true" });
    });

    test("validates stable image-choice keys and private Forms media identifiers", () => {
        const definition = structuredClone(registrationForm.definition) as any;
        const session = definition.steps[1].fields[1];
        session.presentation = "image-grid";
        session.options = [
            { key: "morning", label: "Morning", image: { mediaId: "17", alt: "Morning session" } },
            { key: "afternoon", label: "Afternoon", image: { mediaId: "18" } },
        ];

        expect(formDefinition(definition)).toBe(definition);
        expect(
            submissionAnswers(definition, {
                attendeeName: "Alex Morgan",
                email: "alex@example.test",
                organization: "Example Organization",
                session: "afternoon",
                attendanceType: "remote",
                city: "Bordeaux",
                consent: "true",
            }),
        ).toMatchObject({ session: "afternoon" });
        session.options[1].key = "morning";
        expect(() => formDefinition(definition)).toThrow("duplicate option keys");
        session.options[1].key = "afternoon";
        session.options[1].image.mediaId = "not-an-id";
        expect(() => formDefinition(definition)).toThrow("image choices need a Forms image");
    });

    test("serves a published form and submits through mocked PostgREST", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith("/rpc/get_published_form")) {
                return response(registrationForm);
            }
            if (url.endsWith("/rpc/submit_form")) {
                return response({ ok: true, receiptId: "26db71b6-1f70-4fa4-8e68-d08822f70425" });
            }
            return response({ message: "unexpected request" }, 500);
        };
        const headers = { authorization: "Bearer cms_forms_test", "content-type": "application/json" };
        const read = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/public/form?key=event-registration", { headers }),
        );
        expect(read.status).toBe(200);
        expect((await read.json()).version).toBe(1);

        const submit = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/public/submission?key=event-registration", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    version: 1,
                    idempotencyKey: "3ace3d28-9671-409e-a4da-36f38354f021",
                    sessionId: "74924e5f-9664-44ab-8eb0-2ed8144b90fb",
                    startedAt: new Date(Date.now() - 5000).toISOString(),
                    answers: {
                        attendeeName: "Alex Morgan",
                        email: "alex@example.test",
                        organization: "Example Organization",
                        session: "morning",
                        attendanceType: "in-person",
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
