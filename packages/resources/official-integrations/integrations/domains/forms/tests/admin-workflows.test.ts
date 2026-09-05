import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";
import { registrationForm } from "./fixtures/registration";

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
        key: "event-registration",
        title: registrationForm.definition.title,
        description: registrationForm.definition.description,
        accessMode: registrationForm.accessMode,
        status: "draft",
        version: 1,
        draftDefinition: structuredClone(registrationForm.definition),
    };
    submission = {
        id: 42,
        receiptId: "9bd17b52-69dc-45da-9c4a-d0e947ba5a44",
        formKey: "event-registration",
        formVersion: 1,
        status: "received",
        submittedBy: null,
        createdAt: "2026-09-01T08:00:00Z",
        updatedAt: "2026-09-01T08:00:00Z",
        definition: structuredClone(registrationForm.definition),
        answers: { attendeeName: "Alex Morgan", session: "afternoon", consent: "true" },
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

        const sections = await handleFormsRequest(adminRequest("/admin/form/sections?context=event-registration"));
        expect(sections.status).toBe(200);
        const sectionList = (await sections.json()) as { items: Array<{ id: string }> };
        expect(sectionList.items.length).toBe(4);

        const createdSection = await handleFormsRequest(
            adminRequest("/admin/form/sections/create", { context: "event-registration" }),
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
                key: "preferredFormat",
                label: "Preferred format",
                type: "choice",
                required: true,
                multiple: false,
                presentation: "image-grid",
                imageOptions: [
                    {
                        id: "inside",
                        key: "inside",
                        label: "In person",
                        image: {
                            id: "101",
                            url: "/.cms/sources/forms/choiceImage?id=101",
                            alt: "In-person session",
                        },
                        position: 0,
                    },
                    {
                        id: "terrace",
                        key: "remote",
                        label: "Remote",
                        image: { id: "102", url: "/.cms/sources/forms/choiceImage?id=102" },
                        position: 1,
                    },
                ],
            }),
        );
        expect(savedQuestion.status).toBe(200);
        const savedQuestionBody = (await savedQuestion.json()) as Record<string, unknown>;
        expect(savedQuestionBody).toMatchObject({
            key: "preferredFormat",
            label: "Preferred format",
            type: "choice",
            presentation: "image-grid",
            options: [
                { key: "inside", label: "In person", image: { mediaId: "101", alt: "In-person session" } },
                { key: "remote", label: "Remote", image: { mediaId: "102" } },
            ],
        });
        const duplicateKey = await handleFormsRequest(
            adminRequest("/admin/form/question", {
                ref: savedQuestionBody.ref,
                key: "session",
                label: "Preferred format",
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
            key: "attendeeName",
            section: "Contact details",
            question: "Your name",
            answer: "Alex Morgan",
        });
        expect(resource.answers).toContainEqual({
            key: "consent",
            section: "Review your registration",
            question: "I confirm that these registration details are accurate.",
            answer: "Yes",
        });
        expect(resource.answers).toContainEqual({
            key: "session",
            section: "Event preferences",
            question: "Preferred session",
            answer: "Afternoon",
        });

        const updated = await handleFormsRequest(
            adminRequest("/admin/submission/status", { id: 42, status: "reviewed" }),
        );
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ id: 42, status: "reviewed" });
    });
});
