import type { PublicRepositoryRelease } from "../../compatibility/releaseContracts";
import { repositoryVerificationBundleDownloadPath } from "../routes";
import type { RepositoryCatalogApiRelease } from "./contracts";

export function projectCatalogRelease(release: PublicRepositoryRelease): RepositoryCatalogApiRelease {
    const { verification, migrations, ...summary } = release;
    return {
        ...summary,
        ...(release.verificationDigest
            ? { verificationBundleUrl: repositoryVerificationBundleDownloadPath(release.verificationDigest) }
            : {}),
        ...(verification
            ? {
                  verification: {
                      ...verification,
                      environment: {
                          ...verification.environment,
                          versions: Object.entries(verification.environment.versions)
                              .map(([name, version]) => ({ name, version }))
                              .sort((left, right) => left.name.localeCompare(right.name)),
                      },
                  },
              }
            : {}),
        migrations: migrations.map((migration) => ({
            ...migration,
            checks: Object.entries(migration.checks)
                .map(([name, check]) => ({ name, ...check }))
                .sort((left, right) => left.name.localeCompare(right.name)),
        })),
    };
}
