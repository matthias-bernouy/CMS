import { contentSchema, renderedSchema } from "email-templates/schemas/content";
import type { TemplateContent, TemplateValues } from "email-templates/schemas/content";
import { invalid } from "email-templates/core/errors";
import { tokenPattern, tokens, validUrl, escapeHtml } from "./tokens";
import { validateHtml } from "./html";

export function validateContent(input: TemplateContent): TemplateContent {
    const content = contentSchema.parse(input);
    if (Buffer.byteLength(JSON.stringify(content)) > 65536 || /[\r\n\u0000]/u.test(content.subject)) {
        invalid();
    }
    const names = new Set<string>();
    for (const variable of content.variables) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(variable.name) || names.has(variable.name)) {
            invalid();
        }
        names.add(variable.name);
    }
    for (const source of [content.subject, content.text, content.html ?? ""]) {
        if (tokens(source).some((name) => !names.has(name))) {
            invalid();
        }
    }
    const html = validateHtml(content);
    const normalized = contentSchema.safeParse(content.html === undefined ? content : { ...content, html });
    if (!normalized.success || Buffer.byteLength(JSON.stringify(normalized.data)) > 65536) {
        invalid();
    }
    return normalized.data;
}
export function renderContent(input: TemplateContent, values: TemplateValues) {
    const content = validateContent(input);
    const supplied = new Map<string, string>();
    for (const { name, value } of values) {
        const variable = content.variables.find((entry) => entry.name === name);
        if (!variable || supplied.has(name) || value.length > 8192 || value.includes("\0")) {
            invalid();
        }
        if (variable.kind === "url" && !validUrl(value)) {
            invalid();
        }
        if (
            variable.kind === "date-time" &&
            (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) ||
                !Number.isFinite(Date.parse(value)) ||
                new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19))
        ) {
            invalid();
        }
        supplied.set(name, value);
    }
    if (content.variables.some((variable) => variable.required && !supplied.has(variable.name))) {
        invalid();
    }
    const substitute = (source: string, html = false) =>
        source.replace(tokenPattern, (_match, name: string) => {
            const value = supplied.get(name) ?? "";
            return html ? escapeHtml(value) : value;
        });
    const rendered = {
        subject: substitute(content.subject),
        text: substitute(content.text),
        ...(content.html ? { html: substitute(content.html, true) } : {}),
    };
    if (
        /[\r\n\u0000]/u.test(rendered.subject) ||
        Buffer.byteLength(JSON.stringify(rendered)) > 262144 ||
        !renderedSchema.safeParse(rendered).success
    ) {
        invalid();
    }
    return rendered;
}
