type ThemeColorRole = {
    token: string;
    fallbackToken?: string;
    system: string;
};

type BasicColorScheme = {
    value: string;
    label: string;
    roles: {
        base: ThemeColorRole;
        foreground: ThemeColorRole;
        muted: ThemeColorRole;
        contrasted: ThemeColorRole;
        border: ThemeColorRole;
        focus: ThemeColorRole;
    };
};

const role = (token: string, system: string, fallbackToken?: string): ThemeColorRole => ({
    token,
    ...(fallbackToken ? { fallbackToken } : {}),
    system,
});

export const BASIC_COLOR_SCHEMES: readonly BasicColorScheme[] = [
    {
        value: "primary",
        label: "Primary",
        roles: {
            base: role("action-background", "CanvasText", "primary-base"),
            foreground: role("action-text", "Canvas", "primary-foreground"),
            muted: role("action-muted-background", "Canvas", "primary-muted"),
            contrasted: role("action-muted-text", "CanvasText", "primary-contrasted"),
            border: role("action-border", "CanvasText", "primary-base"),
            focus: role("focus-color", "Highlight", "primary-base"),
        },
    },
    scheme("secondary", "Secondary"),
    {
        value: "neutral",
        label: "Neutral",
        roles: {
            base: role("surface-text", "CanvasText"),
            foreground: role("surface-background", "Canvas"),
            muted: role("subtle-background", "Canvas"),
            contrasted: role("surface-text", "CanvasText"),
            border: role("surface-border", "currentColor"),
            focus: role("surface-text", "Highlight"),
        },
    },
    scheme("info", "Information"),
    scheme("success", "Success"),
    scheme("warning", "Warning"),
    scheme("danger", "Danger"),
];

export const BASIC_COLOR_SCHEME_OPTIONS = BASIC_COLOR_SCHEMES.map(({ label, value }) => ({ label, value }));

export function basicColorSchemeCss(defaultTone = "primary"): string {
    return BASIC_COLOR_SCHEMES.map((colorScheme) => {
        const selectors = `${colorScheme.value === defaultTone ? ":host,\n" : ""}:host([tone="${colorScheme.value}"])`;
        const declarations = Object.entries(colorScheme.roles)
            .map(([name, value]) => `    --_tone-${name}: ${roleValue(value)};`)
            .join("\n");
        return `${selectors} {\n${declarations}\n}`;
    }).join("\n\n");
}

function scheme(value: string, label: string): BasicColorScheme {
    return {
        value,
        label,
        roles: {
            base: role(`${value}-base`, "CanvasText"),
            foreground: role(`${value}-foreground`, "Canvas"),
            muted: role(`${value}-muted`, "Canvas"),
            contrasted: role(`${value}-contrasted`, "CanvasText"),
            border: role(`${value}-base`, "currentColor"),
            focus: role(`${value}-base`, "Highlight"),
        },
    };
}

function roleValue(value: ThemeColorRole): string {
    const fallback = value.fallbackToken
        ? `var(--integration-basic-blocs-${value.fallbackToken}, ${value.system})`
        : value.system;
    return `var(--integration-basic-blocs-${value.token}, ${fallback})`;
}
