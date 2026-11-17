import { expect, test } from "bun:test";
import {
    validatePageContentDocument,
    validatePageContentMarkup,
} from "content/blocs/core/markup/validation/nativeContent";
import {
    managedNativeDocumentIssue,
    managedNativeElementIssue,
} from "content/blocs/core/markup/validation/managedNativeElements";
import { parseHTML } from "linkedom";

test.each([
    '<div cms-bloc="fixture-card"><p>A &amp; B &lt; C</p></div>',
    '<a cms-bloc="fixture-link" href="/caf%C3%A9?q=a&amp;b=c">Café</a>',
    '<div cms-bloc="fixture-card"><p><strong>Nested text</strong></p></div>',
    '<div cms-bloc="fixture-card"><span>&quot;quoted&quot;</span></div>',
])("a private checked DOM preserves canonical serialization and round trips: %s", (html) => {
    const document = validatePageContentDocument(html);
    const canonical = document.body.innerHTML;
    expect(canonical).toBe(validatePageContentMarkup(html));
    expect(validatePageContentDocument(canonical).body.innerHTML).toBe(canonical);
    document.body.replaceChildren();
    expect(validatePageContentMarkup(html)).toBe(canonical);
});

test.each([
    'text<div cms-bloc="fixture-card"></div>',
    "<p>Missing Bloc identity</p>",
    '<div cms-bloc="fixture-card"><!-- invalid --></div>',
    '<div cms-bloc="fixture-card"><script>alert(1)</script></div>',
    '<div cms-bloc="fixture-card" onclick="alert(1)"></div>',
    '<a cms-bloc="fixture-link" href="jav&#x61;script:alert(1)">Unsafe</a>',
    '<div cms-bloc="fixture-card"><svg><path d="M0 0"></path></svg></div>',
])("DOM reuse still refuses invalid content before returning a checked tree: %s", (html) => {
    expect(() => validatePageContentDocument(html)).toThrow();
    expect(() => validatePageContentMarkup(html)).toThrow();
});

test.each([
    '<a cms-bloc="fixture-link" href="/">Safe</a>',
    '<a cms-bloc="fixture-link">Missing destination</a>',
    '<a cms-bloc="fixture-link" href="/"><button>Nested control</button></a>',
    '<div cms-bloc="fixture-link">Wrong native root</div>',
    '<a cms-bloc="fixture-link" href="/"></a><a cms-bloc="fixture-link" href="/other"></a>',
])("managed native checks have the same result on an existing DOM: %s", (html) => {
    const contracts = [{ id: "fixture-link", root: { accepts: ["a" as const] } }];
    const document = parseHTML("<html><body></body></html>").document;
    document.body.innerHTML = html;
    const before = document.body.innerHTML;
    for (const requireExactlyOneHost of [false, true]) {
        expect(managedNativeDocumentIssue(document.body, contracts, { requireExactlyOneHost })).toBe(
            managedNativeElementIssue(html, contracts, { requireExactlyOneHost }),
        );
    }
    expect(document.body.innerHTML).toBe(before);
});
