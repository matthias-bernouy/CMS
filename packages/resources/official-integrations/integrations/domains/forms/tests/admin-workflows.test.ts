import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { restaurantPreview } from "../../../collections/ulvia/blocs/domains/forms/form-renderer/preview";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";

const originalFetch = globalThis.fetch;
const adminHeaders = {
    authorization: "Bearer cms_forms_test",
    "content-type": "application/json",
    "x-cms-user-id": "admin-1",
    "x-cms-user-role": "admin",
};

let managed: Record<string, unknown>;
let submission: Record<string, unknown>;

function response(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function adminRequest(path: string, body?: Record<string, unknown>): Request {
    return new Request(`https://cms.example.test/cms-forms${path}`, {
        method: body ? "POST" : "GET",
        headers: adminHeaders,
        body: body ? JSON.stringify(body) : undefined,
    });
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
    managed = {
        id: 1,
        key: "restaurant-onboarding",
        title: restaurantPreview.definition.title,
        description: restaurantPreview.definition.description,
        accessMode: restaurantPreview.accessMode,
        status: "draft",
        version: 1,
        draftDefinition: structuredClone(restaurantPreview.definition),
    };
    submission = {
        id: 42,
        receiptId: "9bd17b52-69dc-45da-9c4a-d0e947ba5a44",
        formKey: "restaurant-onboarding",
        formVersion: 1,
        status: "received",
        submittedBy: null,
        createdAt: "2026-09-01T08:00:00Z",
        updatedAt: "2026-09-01T08:00:00Z",
        definition: structuredClone(restaurantPreview.definition),
        answers: { ownerName: "Alex Morgan", mood: "bright", consent: "true" },
    };
    globalThis.fetch = async (_input, init) => {
        const url = String(_input);
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        if (url.endsWith("/rpc/get_managed_form")) {
            return response(managed);
        }
        if (url.endsWith("/rpc/list_managed_forms")) {
            return response({ items: [managed], total: 1 });
        }
        if (url.endsWith("/rpc/save_form_draft")) {
            managed.draftDefinition = structuredClone(body.p_definition);
            return response(managed);
        }
        if (url.endsWith("/rpc/get_submission")) {
            return response(submission);
        }
        if (url.endsWith("/rpc/update_submission_status")) {
            submission.status = body.p_status;
            return response({ ok: true });
        }
        return response({ message: `unexpected request: ${url}` }, 500);
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "Deno");
});

describe("Forms admin workflows", () => {
    test("builds sections and questions without exposing JSON", async () => {
        const forms = await handleFormsRequest(adminRequest("/admin/forms?limit=50"));
        expect(forms.status).toBe(200);

        const sections = await handleFormsRequest(adminRequest("/admin/form/sections?context=restaurant-onboarding"));
        expect(sections.status).toBe(200);
        const sectionList = (await sections.json()) as { items: Array<{ id: string }> };
        expect(sectionList.items.length).toBe(4);

        const createdSection = await handleFormsRequest(
            adminRequest("/admin/form/sections/create", { context: "restaurant-onboarding" }),
        );
        const section = (await createdSection.json()) as { ref: string };
        expect(createdSection.status).toBe(200);

        const createdQuestion = await handleFormsRequest(
            adminRequest("/admin/form/questions/create", { context: section.ref }),
        );
        const question = (await createdQuestion.json()) as { ref: string };
        const savedQuestion = await handleFormsRequest(
            adminRequest("/admin/form/question", {
                ref: question.ref,
                key: "preferredTable",
                label: "Preferred atmosphere",
                type: "choice",
                required: true,
                multiple: false,
                presentation: "image-grid",
                imageOptions: [
                    {
                        id: "inside",
                        key: "inside",
                        label: "Inside",
                        image: {
                            id: "101",
                            url: "/.cms/sources/forms/choiceImage?id=101",
                            alt: "Dining room",
                        },
                        position: 0,
                    },
                    {
                        id: "terrace",
                        key: "terrace",
                        label: "Terrace",
                        image: { id: "102", url: "/.cms/sources/forms/choiceImage?id=102" },
                        position: 1,
                    },
                ],
            }),
        );
        expect(savedQuestion.status).toBe(200);
        const savedQuestionBody = (await savedQuestion.json()) as Record<string, unknown>;
        expect(savedQuestionBody).toMatchObject({
            key: "preferredTable",
            label: "Preferred atmosphere",
            type: "choice",
            presentation: "image-grid",
            options: [
                { key: "inside", label: "Inside", image: { mediaId: "101", alt: "Dining room" } },
                { key: "terrace", label: "Terrace", image: { mediaId: "102" } },
            ],
        });
        const duplicateKey = await handleFormsRequest(
            adminRequest("/admin/form/question", {
                ref: savedQuestionBody.ref,
                key: "mood",
                label: "Preferred atmosphere",
                type: "choice",
                presentation: "image-grid",
                imageOptions: [{ key: "inside", label: "Inside", image: { id: "101" } }],
            }),
        );
        expect(duplicateKey.status).toBe(422);
        expect(JSON.stringify(managed)).not.toContain("definitionJson");
    });

    test("shows versioned answers and updates the submission status", async () => {
        const detail = await handleFormsRequest(adminRequest("/admin/submission?id=42"));
        expect(detail.status).toBe(200);
        const resource = (await detail.json()) as Record<string, unknown>;
        expect(resource).not.toHaveProperty("definition");
        expect(resource.answers).toContainEqual({
            key: "ownerName",
            section: "Who should we keep in the loop?",
            question: "Your name",
            answer: "Alex Morgan",
        });
        expect(resource.answers).toContainEqual({
            key: "consent",
            section: "One last look.",
            question: "I confirm that these details are accurate and may be published.",
            answer: "Yes",
        });
        expect(resource.answers).toContainEqual({
            key: "mood",
            section: "Give your place a personality.",
            question: "What should it feel like?",
            answer: "Bright and fresh",
        });

        const updated = await handleFormsRequest(
            adminRequest("/admin/submission/status", { id: 42, status: "reviewed" }),
        );
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ id: 42, status: "reviewed" });
    });
});
