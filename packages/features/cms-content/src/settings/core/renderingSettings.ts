import type { RenderingSettings, TSystem } from "cms-content/settings/interfaces/settings";

/** Projects persisted settings to the fields public rendering actually needs. */
export function projectRenderingSettings(system: TSystem): RenderingSettings {
    const { site } = system;
    return structuredClone({
        site: {
            name: site.name,
            favicon: site.favicon,
            visible: site.visible,
            host: site.host,
            language: site.language,
            ...(site.activeLanguages ? { activeLanguages: site.activeLanguages } : {}),
            organization: site.organization,
            notFound: site.notFound,
            forbidden: site.forbidden,
            serverError: site.serverError,
            login: site.login,
        },
        theme: system.theme,
        security: {
            connectExtras: system.security.connectExtras,
            mediaExtras: system.security.mediaExtras,
        },
    });
}
