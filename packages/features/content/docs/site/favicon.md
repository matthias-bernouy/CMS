# Configure the site favicon

`site.favicon.get` returns the configured `favicon` and the current shared
settings `revision`. An empty value selects the default favicon.
The existing `site.get` and `site.update` response shapes remain unchanged.

Upload/select the image through the selected Files workflow. Make its visibility
public when authorized, then use the permanent immutable generation URL returned
by Files. Temporary signed URLs can expire and are unsuitable for a public favicon.

Call `site.favicon.update` with `expectedRevision` and `favicon`. Public HTTP(S)
URLs without credentials and root-relative paths are accepted. Protocol-relative
URLs, executable/data schemes, backslashes and control characters are refused.
No remote URL is fetched or probed, and this operation never changes file visibility.
A syntactically valid URL is not proof that a file is public or available.

Use `null` or an empty string to clear the selection and restore the default.
Reread after a revision conflict; unrelated site settings must be preserved.
Public Page head metadata and the web
manifest use this setting. Verify both and the image response anonymously after
saving; an administrator session can otherwise conceal a private-file failure.
