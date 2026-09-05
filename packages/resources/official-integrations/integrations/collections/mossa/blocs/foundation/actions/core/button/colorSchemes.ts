type ThemeColorRole = {
    token: string;
};

type MossaColorScheme = {
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

const role = (token: string): ThemeColorRole => ({ token });

const TONE_TOKENS = {
    primary: {
        base: "--ulvia-primary-base",
        foreground: "--ulvia-primary-foreground",
        muted: "--ulvia-primary-muted",
        contrasted: "--ulvia-primary-contrasted",
    },
    secondary: {
        base: "--ulvia-secondary-base",
        foreground: "--ulvia-secondary-foreground",
        muted: "--ulvia-secondary-muted",
        contrasted: "--ulvia-secondary-contrasted",
    },
    info: {
        base: "--ulvia-info-base",
        foreground: "--ulvia-info-foreground",
        muted: "--ulvia-info-muted",
        contrasted: "--ulvia-info-contrasted",
    },
    success: {
        base: "--ulvia-success-base",
        foreground: "--ulvia-success-foreground",
        muted: "--ulvia-success-muted",
        contrasted: "--ulvia-success-contrasted",
    },
    warning: {
        base: "--ulvia-warning-base",
        foreground: "--ulvia-warning-foreground",
        muted: "--ulvia-warning-muted",
        contrasted: "--ulvia-warning-contrasted",
    },
    danger: {
        base: "--ulvia-danger-base",
        foreground: "--ulvia-danger-foreground",
        muted: "--ulvia-danger-muted",
        contrasted: "--ulvia-danger-contrasted",
    },
} as const;

type ToneName = keyof typeof TONE_TOKENS;

export const MOSSA_COLOR_SCHEMES: readonly MossaColorScheme[] = [
    scheme("primary", "Primary"),
    scheme("secondary", "Secondary"),
    {
        value: "neutral",
        label: "Neutral",
        roles: {
            base: role("--ulvia-surface-text"),
            foreground: role("--ulvia-surface-background"),
            muted: role("--ulvia-subtle-background"),
            contrasted: role("--ulvia-surface-text"),
            border: role("--ulvia-surface-border"),
            focus: role("--ulvia-surface-text"),
        },
    },
    scheme("info", "Information"),
    scheme("success", "Success"),
    scheme("warning", "Warning"),
    scheme("danger", "Danger"),
];

export const MOSSA_COLOR_SCHEME_OPTIONS = MOSSA_COLOR_SCHEMES.map(({ label, value }) => ({ label, value }));

export function mossaColorSchemeCss(defaultTone = "primary"): string {
    return MOSSA_COLOR_SCHEMES.map((colorScheme) => {
        const selectors = `${colorScheme.value === defaultTone ? ":host,\n" : ""}:host([tone="${colorScheme.value}"])`;
        const declarations = Object.entries(colorScheme.roles)
            .map(([name, value]) => `    --_mossa-tone-${name}: ${roleValue(value)};`)
            .join("\n");
        return `${selectors} {\n${declarations}\n}`;
    }).join("\n\n");
}

function scheme(value: ToneName, label: string): MossaColorScheme {
    const tokens = TONE_TOKENS[value];
    return {
        value,
        label,
        roles: {
            base: role(tokens.base),
            foreground: role(tokens.foreground),
            muted: role(tokens.muted),
            contrasted: role(tokens.contrasted),
            border: role(tokens.base),
            focus: role(tokens.base),
        },
    };
}

function roleValue(value: ThemeColorRole): string {
    return `var(${value.token})`;
}
