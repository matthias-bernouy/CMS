import { expect, spyOn, test } from "bun:test";
import { renderContent, validateContent } from "@bernouy/email-templates";
import { tokenPattern } from "email-templates/core/render/tokens";
import type { TemplateContent } from "@bernouy/email-templates";

const variable = { name: "x", kind: "text" as const, required: true };
test("oversized expansion refuses before any substitution, including a valid request below 9 KiB", () => {
    const original = String.prototype.replace;
    let substitutions = 0;
    const spy = spyOn(String.prototype, "replace").mockImplementation(function (this: string, pattern, replacement) {
        if (pattern === tokenPattern && typeof replacement === "function") {
            substitutions++;
        }
        return Reflect.apply(original, this, [pattern, replacement]);
    });
    try {
        for (const field of ["text", "html"] as const) {
            const content: TemplateContent = {
                subject: "Subject",
                text: "Text",
                variables: [variable],
                [field]: field === "html" ? `<p>${"{{x}}".repeat(880)}</p>` : "{{x}}".repeat(880),
            };
            const values = [{ name: "x", value: "&".repeat(4096) }];
            expect(Buffer.byteLength(JSON.stringify({ content, values }))).toBeLessThan(9216);
            expect(() => validateContent(content)).not.toThrow();
            expect(() => renderContent(content, values)).toThrow("INVALID_INPUT");
            expect(substitutions).toBe(0);
        }
    } finally {
        spy.mockRestore();
    }
});
test("preflight accounts for HTML entities, JSON escapes, UTF-8 and exact total byte boundaries", () => {
    const content = {
        subject: "S",
        text: "{{x}}".repeat(16),
        html: `<p>${"{{x}}".repeat(16)}</p>`,
        variables: [variable],
    };
    // 34 bytes JSON framing, one subject byte, seven HTML literal bytes: 42 + 32 * 8190 = 262122.
    const accepted = renderContent(content, [{ name: "x", value: "a".repeat(8190) }]);
    expect(Buffer.byteLength(JSON.stringify(accepted))).toBe(262122);
    expect(() => renderContent(content, [{ name: "x", value: "a".repeat(8191) }])).toThrow("INVALID_INPUT");
    for (const value of ['"', "\\", "\n", "\u0001", "é", "€", "😀", "\ud800", "&<>'"]) {
        const result = renderContent({ subject: "S", text: "{{x}}", html: "<p>{{x}}</p>", variables: [variable] }, [
            { name: "x", value },
        ]);
        expect(result.text).toBe(value);
    }
    // A surrogate pair may span two substitutions; it still occupies four UTF-8 bytes.
    const joined = renderContent(
        { subject: "S", text: "{{x}}{{y}}", variables: [variable, { ...variable, name: "y" }] },
        [
            { name: "x", value: "\ud83d" },
            { name: "y", value: "\ude00" },
        ],
    );
    expect(joined.text).toBe("😀");
});
