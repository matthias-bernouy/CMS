import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import { composeThemeSettings, generateThemeCss } from "cms-content/core/theme";
import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { IntegrationThemeContribution } from "cms-content/interfaces/theme";

const THEME_SEMANTIC_BASELINE = `@layer cms-theme-base {
  :where(body) {
    min-block-size: 100dvh;
    margin: 0;
    background: var(--bg-base, Canvas);
    color: var(--text-main, CanvasText);
    font-family: var(--font-body, system-ui, sans-serif);
    font-size: var(--font-size-body, 1rem);
    line-height: 1.5;
  }

  :where(h1, h2, h3, h4, h5, h6) {
    font-family: var(--font-heading, var(--font-body, system-ui, sans-serif));
    line-height: 1.15;
    text-wrap: balance;
  }

  :where(h1) {
    font-size: var(--font-size-display, 3.5rem);
  }

  :where(a) {
    color: var(--primary-base, LinkText);
  }

  :where(button, input, select, textarea) {
    color: inherit;
    font: inherit;
  }

  :where(img, picture, video, canvas, svg) {
    max-inline-size: 100%;
  }

  :where(img, video) {
    block-size: auto;
  }
}`;

/**
 * Build the theme stylesheet entry served at `/.cms/style`.
 * The low-specificity semantic baseline is emitted first, free-form site CSS
 * can style over it, and structured tokens remain authoritative for custom
 * properties managed by the theme editor.
 */
export async function generateStyleEntry(
    reader: ContentReader,
    contributions: readonly IntegrationThemeContribution[] = [],
): Promise<CacheEntry> {
    const settings = await reader.getSystem();
    const theme = composeThemeSettings(settings.theme, contributions);
    const css = [THEME_SEMANTIC_BASELINE, settings.site?.theme ?? "", generateThemeCss(theme)]
        .filter(Boolean)
        .join("\n\n");
    return compress(css, "text/css");
}
