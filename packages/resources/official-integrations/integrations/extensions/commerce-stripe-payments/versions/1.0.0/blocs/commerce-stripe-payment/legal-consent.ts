export const LEGAL_ACCEPTANCE_REQUIRED = "BUYER_LEGAL_ACCEPTANCE_REQUIRED";
export const LEGAL_DOCUMENT_VERSION_CHANGED = "LEGAL_DOCUMENT_VERSION_CHANGED";
export const LEGAL_DOCUMENT_NOT_AVAILABLE = "LEGAL_DOCUMENT_NOT_AVAILABLE";

export type LegalDocumentRequirement = {
    key: string;
    label: string;
    consentText: string;
    pageUrl: string;
    versionId: string;
    versionDate: string;
};

export type PaymentLegalRequirements = {
    enabled: boolean;
    documents: LegalDocumentRequirement[];
};

let legalControlSequence = 0;

export function normalizeLegalRequirements(value: unknown): PaymentLegalRequirements {
    if (!isRecord(value) || typeof value.enabled !== "boolean" || !Array.isArray(value.documents)) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    if (!value.enabled || value.documents.length === 0) {
        return { enabled: false, documents: [] };
    }
    const documents = value.documents.map(normalizeDocument);
    if (new Set(documents.map((document) => document.key)).size !== documents.length) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    if (new Set(documents.map((document) => document.versionId)).size !== documents.length) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    return { enabled: true, documents };
}

export function renderLegalRequirements(
    container: HTMLElement,
    requirements: PaymentLegalRequirements,
    onChange: () => void,
): void {
    container.replaceChildren();
    for (const documentRequirement of requirements.documents) {
        const row = document.createElement("div");
        row.className = "legal-document";
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.required = true;
        checkbox.autocomplete = "off";
        checkbox.checked = false;
        checkbox.defaultChecked = false;
        checkbox.id = `commerce-payment-legal-${++legalControlSequence}`;
        checkbox.dataset.legalVersionId = documentRequirement.versionId;
        checkbox.addEventListener("change", onChange);
        label.htmlFor = checkbox.id;
        label.textContent = documentRequirement.consentText;
        const content = document.createElement("span");
        content.className = "legal-document-content";
        const link = document.createElement("a");
        link.href = safeDocumentUrl(documentRequirement.pageUrl);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Consulter ${documentRequirement.label}`;
        const version = document.createElement("span");
        version.className = "legal-document-version";
        version.textContent = `Version du ${formatVersionDate(documentRequirement.versionDate)}`;
        content.append(label, link, version);
        row.append(checkbox, content);
        container.append(row);
    }
}

export function acceptedLegalDocumentVersionIds(
    container: HTMLElement,
    requirements: PaymentLegalRequirements,
): string[] {
    if (!requirements.enabled) {
        return [];
    }
    const checked = new Set(
        Array.from(container.querySelectorAll<HTMLInputElement>("[data-legal-version-id]:checked"), (input) =>
            String(input.dataset.legalVersionId),
        ),
    );
    if (requirements.documents.some((documentRequirement) => !checked.has(documentRequirement.versionId))) {
        throw new Error(LEGAL_ACCEPTANCE_REQUIRED);
    }
    return requirements.documents.map((documentRequirement) => documentRequirement.versionId);
}

export function isLegalRequirementsRefreshError(error: unknown): boolean {
    return errorCode(error) === LEGAL_DOCUMENT_VERSION_CHANGED;
}

export function errorCode(error: unknown): string {
    if (isRecord(error) && typeof error.code === "string") {
        return error.code;
    }
    return error instanceof Error ? error.message.trim() : "";
}

function normalizeDocument(value: unknown): LegalDocumentRequirement {
    if (!isRecord(value)) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    const documentRequirement = {
        key: readText(value, "key"),
        label: readText(value, "label"),
        consentText: readText(value, "consentText"),
        pageUrl: readText(value, "pageUrl"),
        versionId: readText(value, "versionId"),
        versionDate: readText(value, "versionDate"),
    };
    safeDocumentUrl(documentRequirement.pageUrl);
    if (Number.isNaN(Date.parse(documentRequirement.versionDate))) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    return documentRequirement;
}

function readText(value: Record<string, unknown>, key: string): string {
    const text = value[key];
    if (typeof text !== "string" || !text.trim()) {
        throw new Error("Réponse des conditions contractuelles invalide.");
    }
    return text.trim();
}

function safeDocumentUrl(value: string): string {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Lien des conditions contractuelles invalide.");
    }
    return url.toString();
}

function formatVersionDate(value: string): string {
    const locale = document.documentElement.lang || navigator.language || "fr-FR";
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
