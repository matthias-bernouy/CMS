import { fields } from "../../../../packages/features/forms/tests/fixtures";
export const blocId = "ulvia-dtest--forms-kit--form";
export const textValues = {
    send: "Send",
    sent: "Sent",
    error: "Error",
    ...Object.fromEntries(fields.map((field) => [field.id, field.label])),
};
const text = (id: string) => `{{ cms.i18n.ulvia.test/forms-kit.${id} }}`;
function input(index: number) {
    const field = fields[index]!;
    const name = `answers[${index}]`;
    let control: string;
    if (field.kind === "textarea") {
        control = `<textarea name="${name}[text]"></textarea>`;
    } else if (field.kind === "single-choice" || field.kind === "multiple-choice") {
        control = `<select name="${name}[optionIds][]" ${field.kind === "multiple-choice" ? "multiple" : ""}><option value="a">${text(field.id)}</option></select>`;
    } else if (field.kind === "checkbox" || field.kind === "consent") {
        control = `<input type="checkbox" name="${name}[boolean]">`;
    } else {
        control = `<input type="${field.kind}" name="${name}[${field.kind === "number" ? "number" : "text"}]">`;
    }
    return `<input type="hidden" name="${name}[fieldId]" value="${field.id}"><input type="hidden" name="${name}[kind]" value="${field.kind}"><label>${text(field.id)} ${control}</label>`;
}
export function markup() {
    const form = { formId: { from: "state", key: "@param:ulvia-dtest--forms-kit--form-id" } };
    const submission = {
        ...form,
        formVersion: { from: "state", key: "@page:ulvia-dtest--forms-kit--definition", path: ["data", "formVersion"] },
        attemptId: { from: "state", key: "@param:ulvia-dtest--forms-kit--attempt-id" },
    };
    const codes = [
        "INVALID_INPUT",
        "FORM_NOT_FOUND",
        "REVISION_CONFLICT",
        "IDEMPOTENCY_CONFLICT",
        "FORM_CLOSED",
        "VERSION_CONFLICT",
        "SUBMISSION_NOT_ALLOWED",
        "SUBMISSION_GONE",
        "RATE_LIMITED",
        "CORE_UNAVAILABLE",
    ];
    const outcomes = (name: string, success: string) =>
        `<div cms-match="${name}.outcome.kind"><span cms-case='"none"'></span><div cms-case='"success"'>${success}</div><p cms-case='"failure"' role="alert">${text("error")}</p><div cms-case='"error"'><div cms-match="${name}.outcome.code">${codes.map((code) => `<p cms-case='"${code}"' role="alert">${text("error")}</p>`).join("")}</div></div></div>`;
    const nativeForm = `<form cms-mutation="ulvia/cms.forms:forms.submit-v2 as sent" cms-mutation-input='${JSON.stringify(submission)}' cms-mutation-reset="false">
        ${fields.map((_field, index) => input(index)).join("\n")}
        <button type="submit">${text("send")}</button>
        ${outcomes("sent", `<p role="status">${text("sent")}</p>`)}
      </form>`;
    return `<div><section cms-query="ulvia/cms.forms:forms.get-public-definition-v2 as form" cms-query-input='${JSON.stringify(form)}' cms-sync="@page:ulvia-dtest--forms-kit--definition" cms-sync-select="data.formVersion">${outcomes("form", '<p role="status">{{ form.data.title }}</p>')}</section>${nativeForm}</div>`;
}
