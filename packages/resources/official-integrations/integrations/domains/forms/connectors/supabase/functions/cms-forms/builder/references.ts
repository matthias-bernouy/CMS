import { HttpError, isRecord } from "../http.ts";

export type BuilderReference = {
    formKey: string;
    sectionId?: string;
    questionKey?: string;
};

const formKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function builderReference(value: unknown): BuilderReference {
    const raw = String(value ?? "").trim();
    if (formKeyPattern.test(raw)) {
        return { formKey: raw };
    }
    try {
        const decoded = JSON.parse(atob(fromBase64Url(raw)));
        if (!isRecord(decoded) || !formKeyPattern.test(String(decoded.formKey ?? ""))) {
            throw new Error("invalid form key");
        }
        const result: BuilderReference = { formKey: String(decoded.formKey) };
        if (text(decoded.sectionId)) {
            result.sectionId = String(decoded.sectionId);
        }
        if (text(decoded.questionKey)) {
            result.questionKey = String(decoded.questionKey);
        }
        return result;
    } catch {
        throw new HttpError(422, "builder context is invalid");
    }
}

export function sectionReference(formKey: string, sectionId: string): string {
    return encode({ formKey, sectionId });
}

export function questionReference(formKey: string, sectionId: string, questionKey: string): string {
    return encode({ formKey, sectionId, questionKey });
}

function encode(value: BuilderReference): string {
    return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
}

function text(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 80;
}
