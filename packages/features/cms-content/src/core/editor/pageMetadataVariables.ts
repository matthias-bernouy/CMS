import { SOURCE_INDEXING_VARIABLE_NAMESPACE } from "@bernouy/cms-sources";

/** Namespaces owned by the CMS metadata runtime; integrations cannot declare them. */
export const PAGE_METADATA_RESERVED_NAMESPACES = [SOURCE_INDEXING_VARIABLE_NAMESPACE, "page", "site"] as const;

/** Platform values available independently from the selected dynamic content. */
export const PAGE_METADATA_PLATFORM_VARIABLES = ["page.path", "site.host", "site.language", "site.name"] as const;
