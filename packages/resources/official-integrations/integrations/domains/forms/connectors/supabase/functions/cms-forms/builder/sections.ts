import { HttpError } from "../http.ts";
import {
    editableForm,
    optionalText,
    requiredText,
    saveEditableForm,
    sectionIn,
    stringArray,
    type EditableForm,
    type FormSection,
} from "./model.ts";
import { builderReference, sectionReference } from "./references.ts";

export async function listSections(context: unknown): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    return { items: form.definition.steps.map((section, index) => sectionItem(form, section, index)) };
}

export async function getSection(reference: unknown): Promise<Record<string, unknown>> {
    const form = await editableForm(reference);
    return sectionDetail(form, sectionIn(form));
}

export async function createSection(context: unknown, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    if (form.definition.steps.length >= 20) {
        throw new HttpError(422, "a form cannot contain more than 20 sections");
    }
    const section: FormSection = {
        id: uniqueSectionId(form),
        title: "Untitled section",
        fields: [],
    };
    form.definition.steps.push(section);
    await saveEditableForm(form, form.definition, actor);
    return sectionDetail(form, section);
}

export async function saveSection(input: Record<string, unknown>, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(input.ref);
    const section = sectionIn(form);
    section.title = requiredText(input.title, "section title", 240);
    const description = optionalText(input.description);
    if (description) {
        section.description = description;
    } else {
        delete section.description;
    }
    await saveEditableForm(form, form.definition, actor);
    return sectionDetail(form, section);
}

export async function deleteSection(reference: unknown, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(reference);
    const section = sectionIn(form);
    const remainingQuestions =
        form.definition.steps.reduce((total, item) => total + item.fields.length, 0) - section.fields.length;
    if (form.definition.steps.length === 1 || remainingQuestions < 1) {
        throw new HttpError(422, "keep at least one section and one question in the form");
    }
    form.definition.steps = form.definition.steps.filter((candidate) => candidate.id !== section.id);
    await saveEditableForm(form, form.definition, actor);
    return { ok: true, formKey: form.reference.formKey };
}

export async function reorderSections(
    context: unknown,
    value: unknown,
    actor: string,
): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    const references = stringArray(value, "section order");
    const ids = references.map((reference) => builderReference(reference).sectionId);
    const expected = new Set(form.definition.steps.map((section) => section.id));
    if (ids.length !== expected.size || ids.some((id) => !id || !expected.delete(id))) {
        throw new HttpError(422, "section order must contain every section exactly once");
    }
    const byId = new Map(form.definition.steps.map((section) => [section.id, section]));
    form.definition.steps = ids.map((id) => byId.get(id!)!);
    await saveEditableForm(form, form.definition, actor);
    return await listSections(form.reference.formKey);
}

function sectionItem(form: EditableForm, section: FormSection, position: number): Record<string, unknown> {
    return {
        id: sectionReference(form.reference.formKey, section.id),
        sectionId: section.id,
        title: section.title,
        subtitle: optionalText(section.description) ?? "No description",
        badge: `${section.fields.length} question${section.fields.length === 1 ? "" : "s"}`,
        position,
    };
}

function sectionDetail(form: EditableForm, section: FormSection): Record<string, unknown> {
    return {
        ...sectionItem(form, section, form.definition.steps.indexOf(section)),
        ref: sectionReference(form.reference.formKey, section.id),
        formKey: form.reference.formKey,
        description: section.description ?? "",
        questionCount: section.fields.length,
    };
}

function uniqueSectionId(form: EditableForm): string {
    const used = new Set(form.definition.steps.map((section) => section.id));
    for (let index = form.definition.steps.length + 1; index <= 100; index++) {
        const candidate = `section_${index}`;
        if (!used.has(candidate)) {
            return candidate;
        }
    }
    return `section_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
