import { relative } from "node:path";
import { buildAllDevBlocs, type BuiltBloc } from "../../dev-server/build/index";
import { GENERATED_BLOCS_DIR } from "../../dev-server/integrations";
import { scanDevBlocs, type DevBloc } from "../../dev-server/scan";

export type LocalBlocs = {
    authored: DevBloc[];
    built: Map<string, BuiltBloc>;
};

export async function prepareLocalBlocs(siteDir: string, cwd: string): Promise<LocalBlocs> {
    const authored = await scanDevBlocs(`${siteDir}/blocs`, { quiet: true });
    const generated = await scanDevBlocs(`${siteDir}/${GENERATED_BLOCS_DIR}`, { quiet: true });
    const all = [...authored, ...generated];
    logDiscoveredBlocs(all, cwd);

    const built = all.length > 0 ? await buildAllDevBlocs(all) : new Map<string, BuiltBloc>();
    if (all.length > 0) {
        console.log(`→ Built ${built.size}/${all.length} bloc(s).`);
    }
    return { authored, built };
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
