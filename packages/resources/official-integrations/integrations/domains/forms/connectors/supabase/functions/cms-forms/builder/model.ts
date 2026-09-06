import { HttpError, isRecord } from "../http.ts";
import { rpcRecord } from "../rest.ts";
import { formDefinition } from "../validation.ts";
import { builderReference, type BuilderReference } from "./references.ts";

export type FormQuestion = Record<string, unknown> & {
    key: string;
    label: string;
    type: string;
};

export type FormSection = Record<string, unknown> & {
    id: string;
    title: string;
    fields: FormQuestion[];
};

export type EditableDefinition = Record<string, unknown> & {
    schemaVersion: 1;
    title: string;
    steps: FormSection[];
};

export type EditableForm = {
    reference: BuilderReference;
    managed: Record<string, unknown>;
    definition: EditableDefinition;
};

export async function editableForm(context: unknown): Promise<EditableForm> {
    const reference = builderReference(context);
    const managed = await rpcRecord("get_managed_form", { p_form_key: reference.formKey });
    const definition = structuredClone(formDefinition(managed.draftDefinition)) as EditableDefinition;
    return { reference, managed, definition };
}

export async function saveEditableForm(
    form: EditableForm,
    definition: EditableDefinition,
    actor: string,
): Promise<Record<string, unknown>> {
    definition.title = requiredText(form.managed.title, "form title", 240);
    const valid = formDefinition(definition);
    return await rpcRecord("save_form_draft", {
        p_form_key: form.reference.formKey,
        p_title: form.managed.title,
        p_description: form.managed.description ?? null,
        p_access_mode: form.managed.accessMode,
        p_definition: valid,
        p_actor_id: actor,
    });
}

export function starterDefinition(title: unknown): EditableDefinition {
    const formTitle = String(title ?? "Untitled form").trim() || "Untitled form";
    return {
        schemaVersion: 1,
        configuration: { savedRevision: null, appliedRevision: null },
        title: formTitle,
        successMessage: "Your answers have been received.",
        steps: [
            {
                id: "details",
                title: "First section",
                description: "Start by adapting this section to your form.",
                fields: [{ key: "name", label: "Name", type: "text", required: true }],
            },
        ],
    };
}

export function sectionIn(form: EditableForm): FormSection {
    const section = form.definition.steps.find((candidate) => candidate.id === form.reference.sectionId);
    if (!section) {
        throw new HttpError(404, "section does not exist");
    }
    return section;
}

export function questionIn(form: EditableForm): { section: FormSection; question: FormQuestion } {
    const section = sectionIn(form);
    const question = section.fields.find((candidate) => candidate.key === form.reference.questionKey);
    if (!question) {
        throw new HttpError(404, "question does not exist");
    }
    return { section, question };
}

export function requiredText(value: unknown, name: string, maximum = 240): string {
    const result = String(value ?? "").trim();
    if (!result || result.length > maximum) {
        throw new HttpError(422, `${name} is required and must be at most ${maximum} characters`);
    }
    return result;
}

export function optionalText(value: unknown, maximum = 4000): string | undefined {
    const result = String(value ?? "").trim();
    if (result.length > maximum) {
        throw new HttpError(422, `text must be at most ${maximum} characters`);
    }
    return result || undefined;
}

export function stringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new HttpError(422, `${name} must be an array of identifiers`);
    }
    return value;
}

export function recordArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value) || !value.every(isRecord)) {
        throw new HttpError(422, "options must be an array");
    }
    return value;
}
