import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import { composeThemeSettings, generateThemeCss } from "cms-content/core/theme";
import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { IntegrationThemeContribution } from "cms-content/interfaces/theme";

const DOCUMENT_FOUNDATION = `@layer cms-foundation {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :where(html) {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    min-block-size: 100%;
  }

  :where(body) {
    margin: 0;
    min-block-size: 100%;
  }

  :where([hidden]) {
    display: none !important;
  }
}`;

/**
 * Build the theme stylesheet entry served at `/.cms/style`.
 * A non-visual document foundation is emitted first. Structured theme values
 * follow as custom properties; collections remain responsible for all native
 * element presentation, including typography, colour, spacing, and focus.
 */
export async function generateStyleEntry(
    reader: ContentReader,
    contributions: readonly IntegrationThemeContribution[] = [],
): Promise<CacheEntry> {
    const settings = await reader.getSystem();
    const theme = composeThemeSettings(settings.theme, contributions);
    const css = [DOCUMENT_FOUNDATION, generateThemeCss(theme)].filter(Boolean).join("\n\n");
    return compress(css, "text/css");
}
