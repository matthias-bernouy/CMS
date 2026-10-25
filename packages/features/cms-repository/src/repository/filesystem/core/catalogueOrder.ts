import { compareSemVer } from "cms-repository/exports/contracts/compatibility";

export function compareCatalogueKeys(left: string, right: string): number {
    const a = left.split("\0");
    const b = right.split("\0");
    for (let index = 0; index < 2; index++) {
        if (a[index] !== b[index]) {
            return a[index]! < b[index]! ? -1 : 1;
        }
    }
    const compared = compareSemVer(a[2]!, b[2]!);
    // Build metadata does not affect SemVer precedence; retain deterministic exact-coordinate order.
    return compared || (left < right ? -1 : left > right ? 1 : 0);
}
