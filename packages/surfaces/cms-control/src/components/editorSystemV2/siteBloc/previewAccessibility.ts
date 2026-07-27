export type PreviewAccessibilityIssue = {
    kind: "image-alt" | "interactive-name" | "control-label" | "duplicate-id";
    count: number;
    message: string;
};

export function scanPreviewAccessibility(document: Document): PreviewAccessibilityIssue[] {
    const issues: PreviewAccessibilityIssue[] = [];
    const roots = accessibilityRoots(document);
    addIssue(
        issues,
        "image-alt",
        sum(roots, (root) => root.querySelectorAll("img:not([alt])").length),
        "images are missing an alt attribute",
    );
    addIssue(
        issues,
        "interactive-name",
        sum(
            roots,
            (root) =>
                Array.from(root.querySelectorAll<HTMLElement>("button, a[href]")).filter(
                    (element) => !accessibleName(root, element),
                ).length,
        ),
        "buttons or links have no accessible name",
    );
    addIssue(
        issues,
        "control-label",
        sum(
            roots,
            (root) =>
                Array.from(root.querySelectorAll<HTMLElement>("input, select, textarea")).filter(
                    (element) => needsControlLabel(element) && !hasControlLabel(root, element),
                ).length,
        ),
        "form controls have no label",
    );
    addIssue(
        issues,
        "duplicate-id",
        roots.reduce((total, root) => total + duplicateIdCount(root), 0),
        "elements use a duplicated id",
    );
    return issues;
}

type AccessibilityRoot = Document | ShadowRoot;

function accessibilityRoots(document: Document): AccessibilityRoot[] {
    const roots: AccessibilityRoot[] = [document];
    for (let index = 0; index < roots.length; index += 1) {
        const root = roots[index]!;
        for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
            if (element.shadowRoot?.mode === "open") {
                roots.push(element.shadowRoot);
            }
        }
    }
    return roots;
}

function sum(roots: AccessibilityRoot[], count: (root: AccessibilityRoot) => number): number {
    return roots.reduce((total, root) => total + count(root), 0);
}

function addIssue(
    issues: PreviewAccessibilityIssue[],
    kind: PreviewAccessibilityIssue["kind"],
    count: number,
    message: string,
): void {
    if (count > 0) {
        issues.push({ kind, count, message });
    }
}

function accessibleName(root: AccessibilityRoot, element: HTMLElement): string {
    const direct = element.getAttribute("aria-label")?.trim() || element.getAttribute("title")?.trim();
    if (direct) {
        return direct;
    }
    const labelledBy = element.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
    const referenced = labelledBy
        .map((id) => root.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    if (referenced) {
        return referenced;
    }
    const imageAlt = Array.from(element.querySelectorAll("img[alt]"))
        .map((image) => image.getAttribute("alt")?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    return element.textContent?.trim() || imageAlt;
}

function hasControlLabel(root: AccessibilityRoot, element: HTMLElement): boolean {
    if (accessibleName(root, element) || element.closest("label")) {
        return true;
    }
    const id = element.id;
    return Boolean(
        id &&
            Array.from(root.querySelectorAll<HTMLLabelElement>("label[for]")).some(
                (label) => label.getAttribute("for") === id,
            ),
    );
}

function needsControlLabel(element: HTMLElement): boolean {
    if (element.localName !== "input") {
        return true;
    }
    return !new Set(["hidden", "button", "submit", "reset", "image"]).has(
        (element.getAttribute("type") ?? "text").toLowerCase(),
    );
}

function duplicateIdCount(root: AccessibilityRoot): number {
    const counts = new Map<string, number>();
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("[id]"))) {
        if (element.id) {
            counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
        }
    }
    return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}
