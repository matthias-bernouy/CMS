import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { GENERATED_INTEGRATION_INSTALLATIONS_FILE, SITE_INTEGRATIONS_DIR } from "./paths";

export type MissingGeneratedIntegrationsWarning = {
    imports: string[];
    generatedInstallationsFile: string;
};

export async function detectMissingGeneratedIntegrationArtifacts(siteDir: string): Promise<MissingGeneratedIntegrationsWarning | null> {
    const importsDir = join(siteDir, SITE_INTEGRATIONS_DIR);
    if (!existsSync(importsDir)) return null;

    const imports = (await readdir(importsDir).catch(() => []))
        .filter(file => file.endsWith(".json") && !file.startsWith("."))
        .sort()
        .map(file => `${SITE_INTEGRATIONS_DIR}/${file}`);

    if (imports.length === 0) return null;

    const generatedInstallationsFile = join(siteDir, GENERATED_INTEGRATION_INSTALLATIONS_FILE);
    if (existsSync(generatedInstallationsFile)) return null;

    return { imports, generatedInstallationsFile };
}

export async function warnMissingGeneratedIntegrationArtifacts(siteDir: string): Promise<void> {
    const warning = await detectMissingGeneratedIntegrationArtifacts(siteDir);
    if (!warning) return;

    const count = warning.imports.length;
    console.warn(`! Found ${count} local integration import${count === 1 ? "" : "s"} under ${SITE_INTEGRATIONS_DIR}/, but ${GENERATED_INTEGRATION_INSTALLATIONS_FILE} is missing.`);
    console.warn("  p9r dev does not rebuild integration artifacts automatically because imports can deploy connectors or write secrets.");
    console.warn("  Restore .p9r/generated, run `p9r pull --type=integrations`, or import the integration again from Admin > Integrations.");
}
