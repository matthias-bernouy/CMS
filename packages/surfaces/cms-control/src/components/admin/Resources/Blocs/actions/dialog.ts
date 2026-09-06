import { button, element, icon } from "../view/dom";

export function openDialog(
    root: ShadowRoot,
    title: string,
    className = "",
): { dialog: HTMLDialogElement; body: HTMLElement; footer: HTMLElement } {
    const dialog = root.querySelector<HTMLDialogElement>("dialog")!;
    if (dialog.open) {
        dialog.close();
    }
    dialog.className = className;
    const header = element("header", "dialog-heading");
    const heading = element("h2", "", title);
    heading.id = "bloc-dialog-title";
    const close = button("", "close-dialog", "close-button");
    close.setAttribute("aria-label", "Close dialog");
    close.append(icon("close"));
    close.addEventListener("click", () => dialog.close());
    header.append(heading, close);
    const body = element("div", "dialog-body");
    const footer = element("footer", "dialog-footer");
    dialog.setAttribute("aria-labelledby", heading.id);
    dialog.replaceChildren(header, body, footer);
    dialog.showModal();
    return { dialog, body, footer };
}

export function showForm(
    root: ShadowRoot,
    options: {
        title: string;
        description: string;
        submitLabel: string;
        submit(name: string, description: string): Promise<void>;
    },
): void {
    const { dialog, body, footer } = openDialog(root, options.title);
    body.append(element("p", "dialog-description", options.description));
    const form = element("form", "creation-form");
    form.id = "bloc-creation-form";
    const name = field("Name", "input");
    name.control.required = true;
    name.control.maxLength = 120;
    name.control.setAttribute("autocomplete", "off");
    name.control.name = "name";
    const description = field("Description", "textarea");
    description.control.name = "description";
    description.control.maxLength = 1000;
    const error = element("p", "form-error");
    error.setAttribute("role", "alert");
    form.append(name.label, description.label, error);
    body.append(form);
    const cancel = button("Cancel", "close-dialog", "button quiet");
    cancel.addEventListener("click", () => dialog.close());
    const submit = button(options.submitLabel, "submit-creation", "button primary");
    submit.type = "submit";
    submit.setAttribute("form", form.id);
    footer.append(cancel, submit);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submit.disabled) {
            return;
        }
        submit.disabled = true;
        error.textContent = "";
        try {
            await options.submit(name.control.value.trim(), description.control.value.trim());
            if (body.isConnected) {
                dialog.close();
            }
        } catch (cause) {
            error.textContent = cause instanceof Error ? cause.message : "Unable to save. Please try again.";
        } finally {
            submit.disabled = false;
        }
    });
    name.control.focus();
}

function field(labelText: string, type: "input" | "textarea") {
    const label = element("label", "form-field");
    const control = element(type);
    label.append(element("span", "", labelText), control);
    return { label, control };
}

export function dialogError(body: HTMLElement, message: string): void {
    let error = body.querySelector<HTMLElement>(".form-error");
    if (!error) {
        error = element("p", "form-error");
        error.setAttribute("role", "alert");
        body.append(error);
    }
    error.textContent = message;
}
