import { parseIdentifier, parseSemVer } from "cms-repository/contracts/core/parsing/identifiers";

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function validDottedIdentifier(value: string): boolean {
    try {
        parseIdentifier(value, "$", 96);
        return true;
    } catch {
        return false;
    }
}

export function validCanonicalVersion(value: string): boolean {
    try {
        parseSemVer(value, "$");
        return true;
    } catch {
        return false;
    }
}

export function assertUniqueCatalogueCoordinates<T>(
    entries: readonly T[],
    coordinate: (entry: T) => string,
    artifact: string,
): void {
    const coordinates = entries.map(coordinate);
    if (new Set(coordinates).size !== coordinates.length) {
        throw new TypeError(`Duplicate ${artifact} repository release coordinates`);
    }
}
