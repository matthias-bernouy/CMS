import type {
    CollectionMediaAccept,
    CollectionSlot,
    CollectionSlotAccept,
} from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, integer, keys, ordinal, record, unique } from "../../values";

const MEDIA_ACCEPTS: CollectionMediaAccept[] = ["image", "bitmap", "svg", "video", "audio", "document"];

export function blocReferences(value: unknown, path: string, limits: Readonly<CollectionLimits>): string[] {
    const result = array(value, limits.maxBlocs, path).map((item, index) => identifier(item, `${path}[${index}]`));
    unique(result, path);
    return result.sort(ordinal);
}

export function parseSlots(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): Readonly<Record<string, CollectionSlot>> {
    const source = record(value, path);
    const names = Object.keys(source).sort(ordinal);
    if (names.length > limits.maxSlots) {
        invalid(`must declare at most ${limits.maxSlots} slots`, path);
    }
    return Object.fromEntries(
        names.map((name) => {
            identifier(name, `${path}.${name}`);
            const entry = record(source[name], `${path}.${name}`);
            keys(entry, ["accepts", "min", "max"], `${path}.${name}`);
            const min =
                entry.min === undefined
                    ? undefined
                    : integer(entry.min, 0, Number.MAX_SAFE_INTEGER, `${path}.${name}.min`);
            const max =
                entry.max === undefined
                    ? undefined
                    : integer(entry.max, 0, Number.MAX_SAFE_INTEGER, `${path}.${name}.max`);
            if ((min ?? 0) > (max ?? Number.MAX_SAFE_INTEGER)) {
                invalid("min must not exceed max", `${path}.${name}`);
            }
            return [
                name,
                {
                    ...(entry.accepts === undefined
                        ? {}
                        : { accepts: parseSlotAccepts(entry.accepts, `${path}.${name}.accepts`, limits) }),
                    ...(min === undefined ? {} : { min }),
                    ...(max === undefined ? {} : { max }),
                },
            ];
        }),
    );
}

function parseSlotAccepts(value: unknown, path: string, limits: Readonly<CollectionLimits>): CollectionSlotAccept[] {
    const accepts = array(value, limits.maxBlocs, path).map((value, index): CollectionSlotAccept => {
        const itemPath = `${path}[${index}]`;
        const source = record(value, itemPath);
        if (source.kind === "component") {
            keys(source, ["kind", "tag"], itemPath);
            return { kind: "component", tag: identifier(source.tag, `${itemPath}.tag`) };
        }
        if (source.kind === "any-component") {
            keys(source, ["kind"], itemPath);
            return { kind: "any-component" };
        }
        if (source.kind === "media") {
            keys(source, ["kind", "accept"], itemPath);
            return {
                kind: "media",
                ...(source.accept === undefined
                    ? {}
                    : { accept: parseMediaAccepts(source.accept, `${itemPath}.accept`) }),
            };
        }
        return invalid("slot acceptance kind must be component, any-component or media", `${itemPath}.kind`);
    });
    const signatures = accepts.map((accept) => JSON.stringify(accept));
    unique(signatures, path);
    return accepts;
}

function parseMediaAccepts(value: unknown, path: string): CollectionMediaAccept[] {
    const values = array(value, MEDIA_ACCEPTS.length, path).map((value, index) => {
        if (typeof value !== "string" || !MEDIA_ACCEPTS.includes(value as CollectionMediaAccept)) {
            return invalid(`must be one of ${MEDIA_ACCEPTS.join(", ")}`, `${path}[${index}]`);
        }
        return value as CollectionMediaAccept;
    });
    unique(values, path);
    return values;
}
