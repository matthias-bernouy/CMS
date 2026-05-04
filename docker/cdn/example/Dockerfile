# Example consumer Dockerfile — copy into your project and adjust.
FROM bernouy/cdn-base:0.1.0

# /app/ already has @bernouy/cdn et al. installed via the base image.
# Drop your bootstrap on top:
COPY server.ts /app/server.ts

# (optional) if you want to add extra deps not pre-installed in the base,
# write your own /app/package.json that extends it OR `bun add` here:
# RUN bun add @your-org/something

# ENTRYPOINT and default CMD are inherited from the base image:
#   ENTRYPOINT ["/usr/local/bin/cdn-entrypoint.sh"]
#   CMD        ["bun", "run", "/app/server.ts"]
