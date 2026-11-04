import { expect, spyOn, test } from "bun:test";
import { Element } from "linkedom";
import {
    managedNativeElementIssue,
    type ManagedNativeElementContract,
} from "cms-content/blocs/core/markup/validation/managedNativeElements";

const contracts = Array.from(
    { length: 512 },
    (_, index): ManagedNativeElementContract => ({
        id: `fixture-card-${index}`,
        root: { accepts: ["section"] },
    }),
);

test("managed native validation scans annotated hosts once regardless of the installed catalogue size", () => {
    const query = spyOn(Element.prototype, "querySelectorAll");
    try {
        expect(managedNativeElementIssue('<section cms-bloc="fixture-card-511"></section>', contracts)).toBeNull();
        expect(query.mock.calls.filter(([selector]) => String(selector).startsWith("[cms-bloc"))).toHaveLength(1);
    } finally {
        query.mockRestore();
    }
});

test("host indexing preserves contract diagnostic order, repeated hosts and exact identity matching", () => {
    const html = '<div cms-bloc="fixture-card-1"></div><div cms-bloc="fixture-card-0"></div>';
    expect(managedNativeElementIssue(html, contracts)).toContain('bloc "fixture-card-0"');
    expect(managedNativeElementIssue('<div cms-bloc="FIXTURE-card-0"></div>', contracts)).toBeNull();
    expect(
        managedNativeElementIssue(
            '<section cms-bloc="fixture-card-0"></section><div cms-bloc="fixture-card-0"></div>',
            contracts,
        ),
    ).toContain("accepted native root");
    expect(
        managedNativeElementIssue(
            '<section cms-bloc="fixture-card-0"></section><section cms-bloc="fixture-card-0"></section>',
            [contracts[0]!],
            { requireExactlyOneHost: true },
        ),
    ).toContain("exactly one");
    expect(managedNativeElementIssue("", [contracts[0]!], { requireExactlyOneHost: true })).toContain("exactly one");
});
