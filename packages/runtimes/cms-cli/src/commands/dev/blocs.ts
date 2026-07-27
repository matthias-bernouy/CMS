import { relative } from "node:path";
import { buildAllDevBlocs, type BuiltBloc } from "../../dev-server/bloc-build/index";
import { GENERATED_BLOCS_DIR } from "../../dev-server/integrations";
import { scanDevBlocs, type DevBloc } from "../../dev-server/scan";
import { LocalFsIntegrationInstallationRepository } from "../../dev-server/stores/integrationInstallations";
import type { BlocOwnership } from "@bernouy/cms-content";

export type LocalBlocs = {
    authored: DevBloc[];
    built: Map<string, BuiltBloc>;
};

export async function prepareLocalBlocs(siteDir: string, cwd: string): Promise<LocalBlocs> {
    const authored = await scanDevBlocs(`${siteDir}/blocs`, { quiet: true });
    const generated = await scanDevBlocs(`${siteDir}/${GENERATED_BLOCS_DIR}`, {
        quiet: true,
        ownershipByTag: await integrationBlocOwnership(siteDir),
    });
    const all = [...authored, ...generated];
    logDiscoveredBlocs(all, cwd);

    const built = all.length > 0 ? await buildAllDevBlocs(all) : new Map<string, BuiltBloc>();
    if (all.length > 0) {
        console.log(`→ Built ${built.size}/${all.length} bloc(s).`);
    }
    return { authored, built };
}

async function integrationBlocOwnership(siteDir: string): Promise<Map<string, BlocOwnership>> {
    const installations = await new LocalFsIntegrationInstallationRepository(siteDir).list();
    const ownership = new Map<string, BlocOwnership>();
    for (const installation of installations) {
        const owner: BlocOwnership = {
            kind: "integration",
            integrationKind: installation.definitionSnapshot?.kind ?? installation.id,
            installationId: installation.id,
            definitionVersion: installation.definitionVersion,
        };
        for (const artifact of installation.artifacts) {
            if (artifact.type === "bloc") {
                ownership.set(artifact.id, owner);
            }
        }
    }
    return ownership;
}

function logDiscoveredBlocs(blocs: DevBloc[], cwd: string): void {
    if (blocs.length === 0) {
        return;
    }
    console.log(`→ Found ${blocs.length} bloc(s):`);
    for (const bloc of blocs) {
        const folder = relative(cwd, bloc.folder) || ".";
        console.log(`    • ${bloc.tag.padEnd(28)} ${bloc.label}  —  ${folder}`);
    }
}
