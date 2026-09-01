import { HttpError } from "../http.ts";
import {
    editableForm,
    optionalText,
    questionIn,
    recordArray,
    requiredText,
    saveEditableForm,
    sectionIn,
    stringArray,
    type EditableForm,
    type FormQuestion,
    type FormSection,
} from "./model.ts";
import { builderReference, questionReference, sectionReference } from "./references.ts";

const choiceTypes = new Set(["select", "choice"]);
const questionTypes = new Set(["text", "email", "tel", "number", "date", "textarea", "select", "choice", "checkbox"]);

export async function listQuestions(context: unknown): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    const section = sectionIn(form);
    return { items: section.fields.map((question, index) => questionItem(form, section, question, index)) };
}

export async function getQuestion(reference: unknown): Promise<Record<string, unknown>> {
    const form = await editableForm(reference);
    const { section, question } = questionIn(form);
    return questionDetail(form, section, question);
}

export async function createQuestion(context: unknown, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    const section = sectionIn(form);
    const count = form.definition.steps.reduce((total, candidate) => total + candidate.fields.length, 0);
    if (count >= 100) {
        throw new HttpError(422, "a form cannot contain more than 100 questions");
    }
    const question: FormQuestion = {
        key: uniqueQuestionKey(form),
        label: "Untitled question",
        type: "text",
        required: false,
    };
    section.fields.push(question);
    await saveEditableForm(form, form.definition, actor);
    return questionDetail(form, section, question);
}

export async function saveQuestion(input: Record<string, unknown>, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(input.ref);
    const { section, question } = questionIn(form);
    const type = String(input.type ?? "");
    if (!questionTypes.has(type)) {
        throw new HttpError(422, "question type is not supported");
    }
    question.label = requiredText(input.label, "question label", 240);
    question.type = type;
    setOptional(question, "hint", input.hint);
    setOptional(question, "placeholder", input.placeholder, 240);
    question.required = input.required === true;
    if (choiceTypes.has(type)) {
        question.options = normalizedOptions(input.options);
        question.multiple = type === "choice" && input.multiple === true;
    } else {
        delete question.options;
        delete question.multiple;
    }
    await saveEditableForm(form, form.definition, actor);
    return questionDetail(form, section, question);
}

export async function deleteQuestion(reference: unknown, actor: string): Promise<Record<string, unknown>> {
    const form = await editableForm(reference);
    const { section, question } = questionIn(form);
    const count = form.definition.steps.reduce((total, candidate) => total + candidate.fields.length, 0);
    if (count === 1) {
        throw new HttpError(422, "keep at least one question in the form");
    }
    section.fields = section.fields.filter((candidate) => candidate.key !== question.key);
    await saveEditableForm(form, form.definition, actor);
    return { ok: true, sectionRef: sectionReference(form.reference.formKey, section.id) };
}

export async function reorderQuestions(
    context: unknown,
    value: unknown,
    actor: string,
): Promise<Record<string, unknown>> {
    const form = await editableForm(context);
    const section = sectionIn(form);
    const references = stringArray(value, "question order");
    const keys = references.map((reference) => builderReference(reference).questionKey);
    const expected = new Set(section.fields.map((question) => question.key));
    if (keys.length !== expected.size || keys.some((key) => !key || !expected.delete(key))) {
        throw new HttpError(422, "question order must contain every question exactly once");
    }
    const byKey = new Map(section.fields.map((question) => [question.key, question]));
    section.fields = keys.map((key) => byKey.get(key!)!);
    await saveEditableForm(form, form.definition, actor);
    return await listQuestions(sectionReference(form.reference.formKey, section.id));
}

function questionItem(
    form: EditableForm,
    section: FormSection,
    question: FormQuestion,
    position: number,
): Record<string, unknown> {
    return {
        id: questionReference(form.reference.formKey, section.id, question.key),
        key: question.key,
        title: question.label,
        subtitle: question.required === true ? "Required" : "Optional",
        badge: question.type,
        position,
    };
}

function questionDetail(form: EditableForm, section: FormSection, question: FormQuestion): Record<string, unknown> {
    const options = Array.isArray(question.options)
        ? question.options.filter((option) => typeof option === "object")
        : [];
    return {
        ...questionItem(form, section, question, section.fields.indexOf(question)),
        ref: questionReference(form.reference.formKey, section.id, question.key),
        sectionRef: sectionReference(form.reference.formKey, section.id),
        formKey: form.reference.formKey,
        sectionTitle: section.title,
        label: question.label,
        type: question.type,
        required: question.required === true,
        hint: question.hint ?? "",
        placeholder: question.placeholder ?? "",
        multiple: question.multiple === true,
        options: options.map((option, index) => ({ ...option, id: String(index + 1), position: index })),
    };
}

function normalizedOptions(value: unknown): Record<string, unknown>[] {
    const options = recordArray(value).map((option) => ({
        value: requiredText(option.value, "option value", 160),
        label: requiredText(option.label, "option label", 160),
    }));
    return options.length > 0 ? options : [{ value: "option-1", label: "Option 1" }];
}

function setOptional(target: Record<string, unknown>, key: string, value: unknown, maximum = 1000): void {
    const result = optionalText(value, maximum);
    if (result) {
        target[key] = result;
    } else {
        delete target[key];
    }
}

function uniqueQuestionKey(form: EditableForm): string {
    const used = new Set(form.definition.steps.flatMap((section) => section.fields.map((question) => question.key)));
    for (let index = used.size + 1; index <= 200; index++) {
        const candidate = `question${index}`;
        if (!used.has(candidate)) {
            return candidate;
        }
    }
    return `question_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
