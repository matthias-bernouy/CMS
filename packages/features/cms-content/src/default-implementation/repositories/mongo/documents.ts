import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";

export const SYSTEM_ID = "singleton" as const;

export type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };
export type BlocDoc = WithMongoId<TBloc>;
export type PageDoc = WithMongoId<TPage>;
export type TemplateDoc = WithMongoId<TTemplate>;
export type SystemDoc = TSystem & { _id: typeof SYSTEM_ID };

export function toDoc<T extends { id: string }>(model: T): WithMongoId<T> {
    const { id, ...rest } = model;
    return { _id: id, ...rest } as WithMongoId<T>;
}

export function fromPageDoc(document: PageDoc | null): TPage | null {
    if (!document) {
        return null;
    }
    const { _id, ...rest } = document;
    return { id: _id, ...rest, visible: document.visible === true };
}

export function fromTemplateDoc(document: TemplateDoc | null): TTemplate | null {
    if (!document) {
        return null;
    }
    const { _id, ...rest } = document;
    return { id: _id, ...rest };
}
