import {
    assertBlocOwner,
    type BlocListItemResponse,
    type BlocRecord,
    ContentValidationError,
    DuplicateBlocTagError,
    normalizeBlocWrite,
    type SiteBlocDefinition,
    SiteBlocPublicationRequiredError,
    type TBloc,
    type TBlocWrite,
} from "@bernouy/cms-content";
import type { BuiltBloc } from "../bloc-build/index";
import { buildDevBloc } from "cms-cli/dev-server/bloc-build/index";
import { scanDevBlocs } from "cms-cli/dev-server/scan";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";
import { stageBlocSource, writeBlocSourceAtomically } from "cms-cli/push/blocs/atomicSource";
import { generateSiteBlocBuilderSource, scanSiteBlocDefinitions } from "cms-cli/push/blocs/siteBuilder";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import { rm } from "node:fs/promises";
import { assertBlocSourceOwnership, builtBlocArtifact } from "./blocRecords";

export type BlocsStoreOptions = {
    rootDir?: string;
};

export class BlocsStore {
    private readonly rootDir: string;

    constructor(
        private readonly siteDir: string,
        private readonly built: Map<string, BuiltBloc>,
        options: BlocsStoreOptions = {},
    ) {
        this.rootDir = options.rootDir ?? "blocs";
    }

    async getAllJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return [...this.built.values()].map((bloc) => ({
            id: bloc.tag,
            editorJS: bloc.editorJS ?? "",
            viewJS: bloc.viewJS,
        }));
    }

    async getList(): Promise<BlocListItemResponse[]> {
        return [...this.built.values()].map((bloc) => ({
            id: bloc.tag,
            name: bloc.label,
            group: bloc.group,
            description: bloc.description,
            ownership: structuredClone(bloc.ownership),
        }));
    }

    async getViewJS(tag: string): Promise<string | null> {
        return this.built.get(tag)?.viewJS ?? null;
    }

    async getSource(tag: string): Promise<Record<string, string> | null> {
        const bloc = this.built.get(tag);
        if (!bloc) {
            return null;
        }
        return bloc.source ? structuredClone(bloc.source) : bundleBlocSource(bloc.folder);
    }

    async getRecord(tag: string): Promise<BlocRecord | null> {
        const built = this.built.get(tag);
        const local = await this.findDefinition(tag);
        if (!built && !local) {
            return null;
        }
        const definition = local?.definition ?? built?.siteDefinition;
        const ownership = definition?.ownership ?? built!.ownership;
        return {
            tag,
            ownership: structuredClone(ownership),
            artifact: built ? await builtBlocArtifact(built, ownership) : null,
            ...(definition ? { siteDefinition: structuredClone(definition) } : {}),
        };
    }

    async getRecords(): Promise<BlocRecord[]> {
        const definitions = await scanSiteBlocDefinitions(this.localRoot());
        const tags = new Set([...this.built.keys(), ...definitions.map(({ definition }) => definition.tag)]);
        const records = await Promise.all([...tags].map((tag) => this.getRecord(tag)));
        return records.filter((record): record is BlocRecord => record !== null);
    }

    serializationKey(scope: string): string {
        return `${this.localRoot()}\0${scope}`;
    }

    async create(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        if (await this.getRecord(bloc.id)) {
            throw new DuplicateBlocTagError(bloc.id);
        }
        if (bloc.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        return this.writeArtifact(bloc);
    }

    async replace(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        const current = await this.getRecord(bloc.id);
        if (current) {
            assertBlocOwner(bloc.id, current.ownership, bloc.ownership);
            if (current.ownership.kind === "site-builder") {
                throw new SiteBlocPublicationRequiredError(bloc.id);
            }
        } else if (bloc.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        return this.writeArtifact(bloc);
    }

    async writeArtifact(write: TBloc, definition?: SiteBlocDefinition): Promise<TBloc> {
        const source = write.source;
        if (!source || Object.keys(source).length === 0) {
            throw new ContentValidationError("source", "`p9r dev` bloc writes require an editable source bundle");
        }
        assertBlocSourceOwnership(source, definition !== undefined);
        const target = this.target(write.group, write.id);
        const previousFolder = this.built.get(write.id)?.folder ?? (await this.findDefinition(write.id))?.folder;
        const staged = await stageBlocSource(target, source);
        try {
            const scanned = await scanDevBlocs(staged.path, { quiet: true, strictBuilder: true });
            const devBloc = scanned.find((candidate) => candidate.tag === write.id);
            if (!devBloc) {
                throw new ContentValidationError("source", `written source did not produce bloc "${write.id}"`);
            }
            const built = await buildDevBloc(devBloc);
            await staged.commit();
            const installed: BuiltBloc = {
                ...built,
                folder: target,
                ownership: structuredClone(write.ownership),
                ...(definition ? { siteDefinition: structuredClone(definition), source: structuredClone(source) } : {}),
            };
            this.built.set(installed.tag, installed);
            if (previousFolder && previousFolder !== target) {
                await rm(previousFolder, { recursive: true, force: true });
            }
            return builtBlocArtifact(installed, write.ownership);
        } catch (error) {
            await staged.discard();
            throw error;
        }
    }

    async writeDefinition(current: BlocRecord | null, definition: SiteBlocDefinition): Promise<void> {
        if (!current) {
            await writeBlocSourceAtomically(this.target(definition.draft.group, definition.tag), {
                "builder.json": generateSiteBlocBuilderSource(definition),
            });
            return;
        }
        const local = await this.findDefinition(current.tag);
        const folder = local?.folder ?? this.target(definition.draft.group, definition.tag);
        const source = local ? await bundleBlocSource(folder) : {};
        source["builder.json"] = generateSiteBlocBuilderSource(definition);
        await writeBlocSourceAtomically(folder, source);
        const built = this.built.get(current.tag);
        if (built) {
            this.built.set(current.tag, { ...built, siteDefinition: structuredClone(definition), source });
        }
    }

    private async findDefinition(tag: string) {
        return (await scanSiteBlocDefinitions(this.localRoot())).find(({ definition }) => definition.tag === tag);
    }

    private localRoot(): string {
        return safeJoin(this.siteDir, this.rootDir);
    }

    private target(group: string, tag: string): string {
        return safeJoin(this.siteDir, this.rootDir, categoryToFolder(group), tag);
    }
}
