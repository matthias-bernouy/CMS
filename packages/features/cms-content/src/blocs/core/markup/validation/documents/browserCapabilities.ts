import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { BlocBrowserCapabilities, BlocFrameSandboxPermission } from "cms-content/blocs/interfaces/blocs";
import { normalizeInternalUrl } from "cms-content/blocs/core/markup/security/safeUrl";

export const BLOC_FRAME_SANDBOX_PERMISSIONS = [
    "allow-downloads",
    "allow-forms",
    "allow-modals",
    "allow-popups",
    "allow-same-origin",
    "allow-scripts",
] as const satisfies readonly BlocFrameSandboxPermission[];

const SANDBOX_PERMISSIONS = new Set<string>(BLOC_FRAME_SANDBOX_PERMISSIONS);

/** Validates the browser authority declared by one persisted Bloc document. */
export function validateBlocBrowserCapabilities(
    value: unknown,
    markup: readonly string[],
    field = "browser",
): BlocBrowserCapabilities | undefined {
    const observed = observeFrames(markup);
    if (value === undefined) {
        if (observed.count > 0) {
            throw new ContentValidationError(field, "iframe capabilities must be declared");
        }
        return undefined;
    }
    const source = plainRecord(value, field);
    exactKeys(source, ["frames"], field);
    if (source.frames === undefined) {
        throw new ContentValidationError(field, "frames declaration expected");
    }
    const frames = plainRecord(source.frames, `${field}.frames`);
    exactKeys(frames, ["origins", "sandbox"], `${field}.frames`);
    const origins = stringSet(frames.origins, `${field}.frames.origins`, validFrameOrigin);
    const sandbox = stringSet<BlocFrameSandboxPermission>(
        frames.sandbox,
        `${field}.frames.sandbox`,
        (entry): entry is BlocFrameSandboxPermission => SANDBOX_PERMISSIONS.has(entry),
        true,
    );
    if (observed.count === 0) {
        throw new ContentValidationError(field, "iframe capabilities are declared but unused");
    }
    assertExactSet(origins, observed.origins, `${field}.frames.origins`);
    assertExactSet(sandbox, observed.sandbox, `${field}.frames.sandbox`);
    return { frames: { origins, sandbox } };
}

function observeFrames(markup: readonly string[]): {
    count: number;
    origins: string[];
    sandbox: BlocFrameSandboxPermission[];
} {
    const origins = new Set<string>();
    const sandbox = new Set<BlocFrameSandboxPermission>();
    let count = 0;
    for (const html of markup) {
        const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
        document.body.innerHTML = html;
        for (const iframe of Array.from(document.body.querySelectorAll("iframe"))) {
            count++;
            const src = iframe.getAttribute("src") ?? "";
            origins.add(frameOrigin(src));
            for (const token of (iframe.getAttribute("sandbox") ?? "").trim().split(/\s+/u)) {
                if (token) {
                    sandbox.add(token as BlocFrameSandboxPermission);
                }
            }
        }
    }
    return { count, origins: sorted(origins), sandbox: sorted(sandbox) };
}

function frameOrigin(src: string): string {
    if (normalizeInternalUrl(src) !== null || src.includes("{{")) {
        return "self";
    }
    return new URL(src).origin;
}

function validFrameOrigin(value: string): boolean {
    if (value === "self") {
        return true;
    }
    try {
        const url = new URL(value);
        return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            url.origin === value &&
            url.pathname === "/" &&
            !url.search &&
            !url.hash
        );
    } catch {
        return false;
    }
}

function plainRecord(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError(field, "object expected");
    }
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) {
        throw new ContentValidationError(field, `unknown field ${unknown}`);
    }
}

function stringSet<T extends string>(
    value: unknown,
    field: string,
    valid: (entry: string) => boolean,
    allowEmpty = false,
): T[] {
    if (
        !Array.isArray(value) ||
        (!allowEmpty && value.length === 0) ||
        value.length > 32 ||
        value.some((entry) => typeof entry !== "string" || !valid(entry)) ||
        new Set(value).size !== value.length
    ) {
        throw new ContentValidationError(
            field,
            `${allowEmpty ? "unique" : "non-empty unique"} controlled values expected`,
        );
    }
    return [...value].sort() as T[];
}

function assertExactSet(declared: readonly string[], observed: readonly string[], field: string): void {
    if (declared.length !== observed.length || declared.some((entry, index) => entry !== observed[index])) {
        throw new ContentValidationError(
            field,
            `must exactly match the used values: ${observed.length ? observed.join(", ") : "none"}`,
        );
    }
}

function sorted<T extends string>(values: ReadonlySet<T>): T[] {
    return [...values].sort();
}
