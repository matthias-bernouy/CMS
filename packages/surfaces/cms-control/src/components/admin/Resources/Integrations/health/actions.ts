import type { IntegrationManagement } from "@bernouy/cms-integrations";
import { setSourceContext } from "@bernouy/components";
import { formId, formPart } from "../../Dashboards/runtime/actions/forms/views/composition";
import { fieldElement } from "../../Dashboards/widgets/w-detail/binding/fields";
import { route } from "../api";

/** Integration-declared recovery fields use the same controls and native form binding as views. */
export function healthActions(root: HTMLElement, id: string, management: IntegrationManagement) {
    const forms = new Map<string, { form: HTMLFormElement; modal: HTMLElement }>();
    const actions = [...(management.actions ?? [])];
    for (const action of actions) {
        const modal = formPart<HTMLElement>("modal");
        modal.id = formId();
        modal.setAttribute("aria-label", action.label);
        modal.querySelector('[slot="title"]')!.textContent = action.label;
        const form = modal.querySelector("form")!;
        form.setAttribute(
            "cms-source",
            `${route("/api/integrations/management/action")}?id=${encodeURIComponent(id)} as result`,
        );
        form.setAttribute("cms-source-method", "POST");
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "actionId";
        input.value = action.id;
        form.prepend(input);
        const stack = form.querySelector("[data-operation-fields]")!;
        for (const field of action.fields ?? []) {
            stack.append(fieldElement(field, "actionValues", { valuesPath: "input" }));
        }
        setSourceContext(form, () => ({ actionValues: {} }));
        const submit = formPart<HTMLElement>("submit");
        submit.textContent = action.label;
        stack.append(submit);
        const opener = formPart<HTMLElement>("opener");
        opener.setAttribute("modal-target", modal.id);
        opener.querySelector("p9r-button")!.textContent = action.label;
        root.append(opener, modal);
        forms.set(action.id, { form, modal });
    }
    return (actionId: string) => {
        const entry = forms.get(actionId);
        if (!entry) {
            return;
        }
        // Showing the form also keeps failures and retries visible for operations without extra fields.
        entry.modal.setAttribute("open", "");
    };
}
