# ============================================================================
# Spid3rWeb production-style container image.
#
# Multi-stage build:
#   builder  - compiles the Spid3r toolchain from source using the official
#              installer's documented fallback (`install.sh --source --core`,
#              the same path CI uses). No LLVM/WebKit needed: core-only build.
#   runtime  - slim Debian with the framework code + the compiled binary.
#
# The server binds 0.0.0.0 when SPID3R_HOST=0.0.0.0 (framework default stays
# loopback for local dev — see framework/Application.matrix listen()).
# ============================================================================
FROM rust:bookworm AS builder

ENV CARGO_BUILD_JOBS=2
RUN apt-get update -qq && apt-get install -y -qq curl git >/dev/null \
    && rm -rf /var/lib/apt/lists/*

# Install the Spid3r language toolchain (core only: VM + interpreter).
ENV SPID3R_INSTALL_DIR=/opt/spid3r/bin
RUN curl -fsSL https://raw.githubusercontent.com/needyamin/spid3r/main/install.sh \
      | sh -s -- --source --core --no-modify-path

# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

COPY --from=builder /opt/spid3r/bin/spid3r /usr/local/bin/spid3r

WORKDIR /var/www/app

# Application code (fresh-install skeleton + full framework core)
COPY magic server.matrix spider.toml ./
COPY app/ app/
COPY config/ config/
COPY database/ database/
COPY framework/ framework/
COPY public/ public/
COPY resources/ resources/
COPY routes/ routes/
COPY tests/ tests/
COPY tools/ tools/
COPY .env.example .env.example

# Runtime config: env-first. .env is the fallback template; real values come
# from compose `environment:` which override it.
RUN cp .env.example .env \
    && mkdir -p storage/logs storage/framework/cache database \
    && chmod -R u+rw storage

# SPID3R_PATH lets `spid3r run tools/…` resolve framework imports in-container.
ENV SPID3R_HOST=0.0.0.0 \
    SPID3R_PORT=8000 \
    SPID3R_PATH=/var/www/app

EXPOSE 8000

# Migrate + seed on boot (both idempotent), then serve. `exec` hands PID 1
# to the server so Ctrl+C / docker stop reach it directly. Without the seed
# step a fresh container has no settings/roles and the storefront cannot
# render.
CMD ["sh", "-c", "spid3r magic migrate && spid3r magic db:seed && exec spid3r magic serve --port ${SPID3R_PORT}"]
