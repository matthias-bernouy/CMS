import { dirname, resolve } from "node:path";

export async function loadDefinitionFragment<T>(path: string): Promise<T> {
    return (await expand(await Bun.file(path).json(), dirname(path))) as T;
}

async function expand(value: unknown, parent: string): Promise<unknown> {
    if (Array.isArray(value)) {
        return Promise.all(value.map((entry) => expand(entry, parent)));
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.$include === "string") {
        const included = resolve(parent, record.$include);
        return expand(await Bun.file(included).json(), dirname(included));
    }
    if (Array.isArray(record.$files)) {
        const entries = await Promise.all(
            record.$files.map(async (file) => {
                const included = resolve(parent, String(file));
                return expand(await Bun.file(included).json(), dirname(included));
            }),
        );
        return entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
    }
    return Object.fromEntries(
        await Promise.all(Object.entries(record).map(async ([key, entry]) => [key, await expand(entry, parent)])),
    );
}
