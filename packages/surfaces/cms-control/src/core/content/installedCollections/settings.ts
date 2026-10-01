import type { TBloc } from "@bernouy/cms-content";

type InstalledSettings = Pick<TBloc, "id" | "defaultContent" | "collectionSettings">;

/** The inserted host owns settings; the collection keeps only its fixed Light DOM. */
export function installedBlocInitialMarkup(bloc: InstalledSettings): string {
    const attributes = (bloc.collectionSettings ?? [])
        .flatMap(({ id, default: value }) => {
            if (value === false || value === null || value === undefined) {
                return [];
            }
            return [value === true ? ` ${id}` : ` ${id}="${escapeAttribute(String(value))}"`];
        })
        .join("");
    return `<${bloc.id}${attributes}>${bloc.defaultContent ?? ""}</${bloc.id}>`;
}

export function installedBlocSettingControls(bloc: InstalledSettings): Record<string, unknown>[] {
    return (bloc.collectionSettings ?? []).map((item) => {
        const base = {
            label: item.label,
            attribute: item.id,
            ...(item.help ? { help: item.help } : {}),
            ...(item.visibleWhen
                ? {
                      visibleWhen: item.visibleWhen.map(({ setting, ...comparison }) => ({
                          attribute: setting,
                          ...comparison,
                      })),
                  }
                : {}),
        };
        if (item.type === "boolean") {
            return { ...base, type: "toggle" };
        }
        const { kind, ...control } = item.control;
        return {
            ...base,
            ...control,
            type: kind,
            ...(kind === "text" || kind === "textarea"
                ? {
                      ...(item.minLength !== undefined ? { minLength: item.minLength } : {}),
                      maxLength: item.maxLength,
                  }
                : {}),
        };
    });
}

export function installedBlocSettingSections(
    bloc: InstalledSettings,
): { kind: "self"; label: string; settings: Record<string, unknown>[] }[] {
    const controls = installedBlocSettingControls(bloc);
    if (controls.length === 0) {
        return [];
    }
    const sections: { kind: "self"; label: string; settings: Record<string, unknown>[] }[] = [];
    for (const [index, item] of (bloc.collectionSettings ?? []).entries()) {
        const label = item.group ?? "Settings";
        let section = sections.find((section) => section.label === label);
        if (!section) {
            section = { kind: "self", label, settings: [] };
            sections.push(section);
        }
        section.settings.push(controls[index]!);
    }
    return sections;
}

function escapeAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
