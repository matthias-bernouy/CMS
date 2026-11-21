import { expect, test } from "bun:test";
import { renderContent, validateContent } from "@bernouy/email-templates";
import type { TemplateContent } from "@bernouy/email-templates";

const content: TemplateContent = {
    subject: "Hello {{name}}",
    text: "{{name}}: {{link}}",
    html: '<p>{{name}}</p><a href="{{link}}">Continue</a>',
    variables: [
        { name: "name", kind: "text", required: true },
        { name: "link", kind: "url", required: true },
    ],
};
const values = [
    { name: "name", value: "<b>{{link}}</b>" },
    { name: "link", value: "https://example.com/?a=1&b=2" },
];
test("single-pass rendering escapes values without changing the original publication", () => {
    const result = renderContent(content, values);
    expect(result.text).toBe("<b>{{link}}</b>: https://example.com/?a=1&b=2");
    expect(result.html).toBe(
        '<p>&lt;b&gt;{{link}}&lt;/b&gt;</p><a href="https://example.com/?a=1&amp;b=2">Continue</a>',
    );
    expect(content.subject).toBe("Hello {{name}}");
});
test("closed variable declarations and input values reject duplicates and unknown names", () => {
    for (const input of [
        [],
        [...values, values[0]!],
        [...values, { name: "foreign", value: "secret" }],
        [
            { name: "name", value: "x" },
            { name: "link", value: "javascript:alert(1)" },
        ],
    ]) {
        expect(() => renderContent(content, input)).toThrow();
    }
    expect(() => validateContent({ ...content, variables: [...content.variables, content.variables[0]!] })).toThrow();
    expect(() => validateContent({ ...content, text: "{{unknown}}" })).toThrow();
    expect(() => validateContent({ ...content, text: "{{ name }}" })).toThrow();
});
test("HTML rejects executable markup, CSS, remote assets and unsafe token positions", () => {
    for (const html of [
        "<script>alert(1)</script>",
        "</body><script>alert(1)</script>",
        "</body><a href=javascript:alert(1)>x</a>",
        "</body><div onclick=alert(1)>x</div>",
        "<body onload=alert(1)>x</body>",
        '<img src="https://example.com/pixel">',
        '<p onclick="x">x</p>',
        '<p style="color:red">x</p>',
        "<iframe></iframe>",
        '<a href="javascript:alert(1)">x</a>',
        '<a href="https://evil.test/?next={{link}}">x</a>',
        '<a href="{{name}}">x</a>',
        "<{{name}}>x</{{name}}>",
        '<p title="{{name}}">x</p>',
        "<!--{{name}}-->",
    ]) {
        expect(() => validateContent({ ...content, html })).toThrow();
    }
});
test("subject injection and expanded volume are bounded", () => {
    expect(() =>
        renderContent(content, [{ name: "name", value: "hello\r\nBcc:evil@example.com" }, values[1]!]),
    ).toThrow();
    expect(() =>
        renderContent({ ...content, text: "{{name}}".repeat(100) }, [
            { name: "name", value: "x".repeat(8192) },
            values[1]!,
        ]),
    ).toThrow();
});
