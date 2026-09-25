import { ReleaseValidationError } from "../../protocol/errors";

const SEMVER =
    "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?";
// The final negative lookahead also rejects a trailing line terminator, which $ alone permits.
export const EXACT = new RegExp(`^${SEMVER}$(?![\\s\\S])`);
export const PREFIX = new RegExp(`^([~^])(${SEMVER})$(?![\\s\\S])`);
export const COMPARATOR = new RegExp(`^(>=|>|<=|<|=)(${SEMVER})$(?![\\s\\S])`);

/** A bounded union of exact, caret, tilde, or comparator-intersection ranges. */
export function parseVersionRange(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256) {
        throw invalidRange(path);
    }
    const branches = value.split(" || ").map(normalizeBranch);
    if (
        branches.length > 4 ||
        new Set(branches).size !== branches.length ||
        branches.some((branch) => !validBranch(branch))
    ) {
        throw invalidRange(path);
    }
    return branches.sort(ordinal).join(" || ");
}

function validBranch(branch: string): boolean {
    if (EXACT.test(branch) || PREFIX.test(branch)) {
        return true;
    }
    return branch.split(" ").every((part) => COMPARATOR.test(part));
}

function normalizeBranch(branch: string): string {
    return EXACT.test(branch) || PREFIX.test(branch) ? branch : branch.split(" ").sort(ordinal).join(" ");
}

function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function invalidRange(path: string): ReleaseValidationError {
    return new ReleaseValidationError(
        "invalid_contract",
        "must be a bounded exact, caret, tilde, or comparator SemVer range",
        path,
    );
}
