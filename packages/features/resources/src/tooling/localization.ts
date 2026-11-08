import type { TBlocWrite, ThemeSource } from "@bernouy/content";
import type { BlocSettingItem, BlocSettingControl } from "@bernouy/content/page-document";
import type { PreparedResourceSource } from "./interfaces";
import { translate } from "./source/metadata";

export function localizedBloc(bloc: TBlocWrite, source: PreparedResourceSource, locale: string): TBlocWrite {
    const text = (key: string) => translate(source, key, locale);
    return {
        ...bloc,
        name: text(bloc.name),
        group: text(bloc.group),
        description: bloc.description ? text(bloc.description) : "",
        ...(bloc.categories ? { categories: bloc.categories.map(text) } : {}),
        ...(bloc.settings
            ? {
                  settings: bloc.settings.map(
                      (setting): BlocSettingItem =>
                          ({
                              ...setting,
                              label: text(setting.label),
                              ...(setting.group ? { group: text(setting.group) } : {}),
                              ...(setting.help ? { help: text(setting.help) } : {}),
                              control: control(setting.control, text),
                          }) as BlocSettingItem,
                  ),
              }
            : {}),
    };
}
function control(value: BlocSettingControl, text: (key: string) => string): BlocSettingControl {
    if (value.kind === "text") {
        return { ...value, ...(value.placeholder ? { placeholder: text(value.placeholder) } : {}) };
    }
    if (value.kind === "number" || value.kind === "range") {
        return { ...value, ...(value.suffix ? { suffix: text(value.suffix) } : {}) };
    }
    if (value.kind === "select" || value.kind === "segmented") {
        return { ...value, options: value.options.map((item) => ({ ...item, label: text(item.label) })) };
    }
    if (value.kind === "color" && value.tokens) {
        return { ...value, tokens: value.tokens.map((item) => ({ ...item, label: text(item.label) })) };
    }
    return value;
}
export function localizedTheme(theme: ThemeSource, source: PreparedResourceSource, locale: string): ThemeSource {
    const text = (key: string) => translate(source, key, locale);
    return {
        ...theme,
        label: text(theme.label),
        categories: theme.categories.map((category) => ({
            ...category,
            label: text(category.label),
            description: category.description ? text(category.description) : "",
            tokens: category.tokens.map((token) => ({
                ...token,
                label: text(token.label),
                description: token.description ? text(token.description) : "",
            })),
        })),
    };
}
