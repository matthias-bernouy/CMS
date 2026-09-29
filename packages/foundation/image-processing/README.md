# @bernouy/image-processing

Reusable image inspection and WebP byte transformation. The root export is
type-only; `@bernouy/image-processing/sharp` loads the optional Sharp adapter.
Callers choose the width, quality, pixel and time limits, and orientation/color
handling. CMS file manifests and provider derivative identities stay with their
own packages.
