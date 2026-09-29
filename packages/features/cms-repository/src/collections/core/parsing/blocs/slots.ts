import type { CollectionSlot } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, integer, keys, ordinal, record, unique } from "../../values";

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
                        : { accepts: blocReferences(entry.accepts, `${path}.${name}.accepts`, limits) }),
                    ...(min === undefined ? {} : { min }),
                    ...(max === undefined ? {} : { max }),
                },
            ];
        }),
    );
}
