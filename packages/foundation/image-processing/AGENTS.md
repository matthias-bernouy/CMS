# @bernouy/image-processing

Generic image decoding and byte transformation only. Do not import CMS packages,
choose derivative keys, schedule jobs, or decide authorization and cache policy.
Keep Sharp behind the `./sharp` subpath so type-only consumers do not load libvips.
