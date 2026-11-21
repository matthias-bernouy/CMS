import { expect, test } from "bun:test";
import { renderContent, validateContent } from "@bernouy/email-templates";
import type { TemplateContent } from "@bernouy/email-templates";

const variable = { name: "x", kind: "text" as const, required: true };

test("source field and declaration limits retain their exact boundaries", () => {
    const base = { subject: "S", text: "T", variables: [] };
    for (const [field, maximum] of [
        ["subject", 500],
        ["text", 32768],
        ["html", 32768],
    ] as const) {
        const value = (length: number) => (field === "html" ? `<p>${"a".repeat(length - 7)}</p>` : "a".repeat(length));
        expect(() => validateContent({ ...base, [field]: value(maximum) })).not.toThrow();
        expect(() => validateContent({ ...base, [field]: value(maximum + 1) })).toThrow();
    }
    const variables = Array.from({ length: 32 }, (_, index) => ({ ...variable, name: `v${index}` }));
    expect(() => validateContent({ ...base, variables })).not.toThrow();
    expect(() => validateContent({ ...base, variables: [...variables, variable] })).toThrow();
});

test("source JSON budget counts UTF-8 bytes at the exact boundary", () => {
    const base: TemplateContent = { subject: "S", text: "a".repeat(32768), html: "<p></p>", variables: [] };
    const padding = 65536 - Buffer.byteLength(JSON.stringify(base));
    const exact = { ...base, html: `<p>${"a".repeat(padding)}</p>` };
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(65536);
    expect(() => validateContent(exact)).not.toThrow();
    expect(() => validateContent({ ...exact, html: exact.html.replace("a", "é") })).toThrow("INVALID_INPUT");
});

test("rendered JSON budget retains the exact total boundary across fields", () => {
    const content = {
        subject: "S".repeat(23),
        text: "{{x}}".repeat(16),
        html: `<p>${"{{x}}".repeat(16)}</p>`,
        variables: [variable],
    };
    const values = [{ name: "x", value: "a".repeat(8190) }];
    expect(Buffer.byteLength(JSON.stringify(renderContent(content, values)))).toBe(262144);
    expect(() => renderContent({ ...content, subject: `${content.subject}S` }, values)).toThrow("INVALID_INPUT");
});

test("variable and rendered field limits count UTF-16 code units before expansion", () => {
    const source = { subject: "S", text: "{{x}}", variables: [variable] };
    expect(renderContent(source, [{ name: "x", value: "😀".repeat(4096) }]).text.length).toBe(8192);
    expect(() => renderContent(source, [{ name: "x", value: "a".repeat(8193) }])).toThrow("INVALID_INPUT");
    const subject = { ...source, subject: "{{x}}", text: "T" };
    expect(renderContent(subject, [{ name: "x", value: "a".repeat(998) }]).subject.length).toBe(998);
    expect(() => renderContent(subject, [{ name: "x", value: "a".repeat(999) }])).toThrow("INVALID_INPUT");
    for (const field of ["text", "html"] as const) {
        const body = field === "html" ? `<p>${"{{x}}".repeat(15)}${"a".repeat(8185)}</p>` : "{{x}}".repeat(16);
        const content = { ...source, [field]: body };
        const value = "a".repeat(8192);
        // HTML's seven literal code units use the same field budget as substitutions.
        expect(renderContent(content, [{ name: "x", value }])[field]?.length).toBe(131072);
        expect(() => renderContent({ ...content, [field]: `${body}a` }, [{ name: "x", value }])).toThrow(
            "INVALID_INPUT",
        );
    }
});
