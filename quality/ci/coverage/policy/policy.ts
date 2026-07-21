import type { CoveragePackage } from "../types";

export function assertEveryPackageHasTests(packages: CoveragePackage[]): void {
    const missing = packages.filter((packageInfo) => !packageInfo.hasTests).map((packageInfo) => packageInfo.name);
    if (missing.length > 0) {
        throw new Error(`Coverage requires a tests directory for every package; missing: ${missing.join(", ")}`);
    }
}

export function assertBaselineUpdateAllowed(updateBaseline: boolean, ci: string | undefined): void {
    if (updateBaseline && ci?.toLowerCase() === "true") {
        throw new Error("Coverage baseline updates are forbidden in CI");
    }
}

export function normalizeCoverageReference(reference: string | undefined): string | undefined {
    const normalized = reference?.trim();
    if (!normalized || /^0+$/.test(normalized)) return undefined;
    return normalized;
}

export function resolveCoverageReference(reference: string | undefined, ci: string | undefined): string | undefined {
    return normalizeCoverageReference(reference) ?? (ci?.toLowerCase() === "true" ? "HEAD^" : undefined);
}
