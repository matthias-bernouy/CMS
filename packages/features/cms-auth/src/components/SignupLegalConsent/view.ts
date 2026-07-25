import type { SignupLegalRequirementView } from "./requirements";
import { SIGNUP_LEGAL_CONSENT_STYLES } from "./styles";

export type SignupLegalConsentCopy = {
    heading: string;
    loadingLabel: string;
    loadErrorLabel: string;
    retryLabel: string;
    newTabLabel: string;
};

export type SignupLegalConsentViewState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "empty" }
    | { kind: "ready"; documents: SignupLegalRequirementView[]; selectedIds: ReadonlySet<string> };

export function renderSignupLegalConsent(
    root: ShadowRoot,
    state: SignupLegalConsentViewState,
    copy: SignupLegalConsentCopy,
    callbacks: { change(): void; retry(): void },
): HTMLInputElement[] {
    const document = root.ownerDocument;
    const style = document.createElement("style");
    style.textContent = SIGNUP_LEGAL_CONSENT_STYLES;
    const fieldset = document.createElement("fieldset");
    fieldset.setAttribute("part", "fieldset");
    const legend = document.createElement("legend");
    legend.setAttribute("part", "legend");
    legend.textContent = copy.heading;
    fieldset.append(legend);

    const checkboxes =
        state.kind === "ready" ? renderDocuments(fieldset, state.documents, state.selectedIds, callbacks.change) : [];
    if (state.kind === "loading") {
        fieldset.append(status(document, copy.loadingLabel, "status"));
    } else if (state.kind === "error") {
        fieldset.append(status(document, copy.loadErrorLabel, "alert"));
        const retry = document.createElement("button");
        retry.type = "button";
        retry.setAttribute("part", "retry");
        retry.textContent = copy.retryLabel;
        retry.addEventListener("click", callbacks.retry);
        fieldset.append(retry);
    }

    root.replaceChildren(style, fieldset);
    return checkboxes;
}

function renderDocuments(
    fieldset: HTMLFieldSetElement,
    documents: SignupLegalRequirementView[],
    selectedIds: ReadonlySet<string>,
    onChange: () => void,
): HTMLInputElement[] {
    const owner = fieldset.ownerDocument;
    const list = owner.createElement("div");
    list.className = "documents";
    list.setAttribute("part", "documents");
    const checkboxes = documents.map((requirement, index) => {
        const row = owner.createElement("div");
        row.className = "requirement";
        row.setAttribute("part", "requirement");
        const checkbox = owner.createElement("input");
        const checkboxId = `signup-legal-document-${index}`;
        const linkId = `${checkboxId}-link`;
        checkbox.id = checkboxId;
        checkbox.type = "checkbox";
        checkbox.required = true;
        checkbox.checked = selectedIds.has(requirement.versionId);
        checkbox.dataset.versionId = requirement.versionId;
        checkbox.setAttribute("part", "checkbox");
        checkbox.setAttribute("aria-describedby", linkId);
        checkbox.addEventListener("change", onChange);

        const copy = owner.createElement("div");
        copy.className = "copy";
        const label = owner.createElement("label");
        label.htmlFor = checkboxId;
        label.setAttribute("part", "consent");
        label.textContent = requirement.consentText;
        const link = owner.createElement("a");
        link.id = linkId;
        link.href = requirement.href;
        link.target = "_blank";
        link.rel = "noopener";
        link.setAttribute("part", "link");
        link.append(owner.createTextNode(requirement.label), newTabNotice(owner));
        copy.append(label, link);
        row.append(checkbox, copy);
        list.append(row);
        return checkbox;
    });
    fieldset.append(list);
    return checkboxes;
}

function newTabNotice(document: Document): HTMLSpanElement {
    const notice = document.createElement("span");
    notice.className = "sr-only";
    notice.dataset.newTabNotice = "";
    return notice;
}

function status(document: Document, message: string, role: "status" | "alert"): HTMLParagraphElement {
    const element = document.createElement("p");
    element.className = "status";
    element.setAttribute("part", "status");
    element.setAttribute("role", role);
    element.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");
    element.dataset.kind = role === "alert" ? "error" : "loading";
    element.textContent = message;
    return element;
}

export function setNewTabNotices(root: ShadowRoot, label: string): void {
    for (const notice of Array.from(root.querySelectorAll<HTMLElement>("[data-new-tab-notice]"))) {
        notice.textContent = ` (${label})`;
    }
}
