export class RepositoryFormError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RepositoryFormError";
    }
}

export function requiredField(form: HTMLFormElement, name: string, label: string): string {
    const value = field(form, name).value.trim();
    if (!value) {
        throw new RepositoryFormError(`${label} is required.`);
    }
    return value;
}

export function optionalField(form: HTMLFormElement, name: string): string | undefined {
    return field(form, name).value.trim() || undefined;
}

export function field(form: HTMLFormElement, name: string): HTMLInputElement | HTMLTextAreaElement {
    const element = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!element) {
        throw new RepositoryFormError(`Missing form field ${name}.`);
    }
    return element;
}
