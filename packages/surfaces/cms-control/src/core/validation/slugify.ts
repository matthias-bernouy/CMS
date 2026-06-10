/** Derives a lowercase-kebab id from a free-text name. Shared id shape of the
 *  admin create flows (gateway provider, identity provider). */
export const slugify = (s: string): string =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
