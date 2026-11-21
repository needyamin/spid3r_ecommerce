# ============================================================================
# Spid3rWeb production-style container image.
#
# Installs a pinned Spid3r release tarball directly from GitHub Releases and
# verifies its SHA-256 checksum, then runs the app as an unprivileged user.
#
# The server binds 0.0.0.0 when SPID3R_HOST=0.0.0.0 (framework default stays
# loopback for local dev — see framework/Application.matrix listen()).
# ============================================================================
FROM debian:bookworm-slim AS runtime

ARG SPID3R_VERSION=1.1.1
ARG SPID3R_SHA256=""

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl ca-certificates libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# The prebuilt spid3r binary links against libLLVM.so.23.1 (LLVM 23 runtime).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends gnupg \
    && curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key | gpg --dearmor -o /usr/share/keyrings/llvm.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/llvm.gpg] https://apt.llvm.org/bookworm/ llvm-toolchain-bookworm-23 main" > /etc/apt/sources.list.d/llvm23.list \
    && apt-get update -qq && apt-get install -y -qq --no-install-recommends libllvm23 \
    && echo /usr/lib/llvm-23/lib > /etc/ld.so.conf.d/llvm-23.conf && ldconfig \
    && apt-get purge -y -qq gnupg && apt-get autoremove -y -qq && rm -rf /var/lib/apt/lists/*

# Install pinned Spid3r release binaries with SHA-256 verification
RUN set -eu; \
    arch="$(uname -m)"; \
    case "$arch" in \
        x86_64|amd64) target="x86_64-unknown-linux-gnu" ;; \
        aarch64|arm64) target="aarch64-unknown-linux-gnu" ;; \
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    asset="spid3r-${target}.tar.gz"; \
    base_url="https://github.com/needyamin/spid3r/releases/download/v${SPID3R_VERSION}"; \
    tmpdir="$(mktemp -d)"; \
    trap 'rm -rf "$tmpdir"' EXIT; \
    curl -fsSL "${base_url}/${asset}" -o "${tmpdir}/${asset}"; \
    if [ -n "${SPID3R_SHA256}" ]; then \
        echo "${SPID3R_SHA256}  ${tmpdir}/${asset}" | sha256sum -c -; \
    else \
        curl -fsSL "${base_url}/sha256sums.txt" -o "${tmpdir}/sha256sums.txt"; \
        (cd "$tmpdir" && expected="$(awk -v a="${asset}" '$2 == a || $2 == "*" a {print $1; exit}' sha256sums.txt)" && test -n "${expected}" && echo "${expected}  ${asset}" | sha256sum -c -); \
    fi; \
    tar -xzf "${tmpdir}/${asset}" -C "$tmpdir"; \
    bin_src="$(find "$tmpdir" -type f -name spid3r | head -n 1)"; \
    test -n "$bin_src"; \
    install -m 0755 "$bin_src" /usr/local/bin/spid3r; \
    self_src="$(find "$tmpdir" -type f -name spid3r-self | head -n 1 || true)"; \
    if [ -n "$self_src" ] && [ -f "$self_src" ]; then \
        install -m 0755 "$self_src" /usr/local/bin/spid3r-self; \
    fi

# Unprivileged application user & group
RUN groupadd --system spid3r \
    && useradd --system --gid spid3r --home-dir /var/www/app --shell /usr/sbin/nologin spid3r

WORKDIR /var/www/app

# Copy only runtime application files (no tests, docs, or .env secrets)
COPY magic server.matrix spider.toml ./
COPY spid3r.ini.example ./spid3r.ini
COPY app/ app/
COPY bootstrap/ bootstrap/
COPY config/ config/
COPY database/ database/
COPY framework/ framework/
COPY public/ public/
COPY resources/ resources/
COPY routes/ routes/

# Runtime writable directories belong exclusively to the unprivileged user;
# source files remain root-owned and read-only to the app process.
RUN mkdir -p storage/logs storage/framework/cache storage/app storage/backups storage/database database \
    && chown -R spid3r:spid3r storage database \
    && chmod 0700 storage storage/logs storage/framework storage/framework/cache storage/app storage/backups storage/database database

ENV APP_ENV=production \
    SPID3R_HOST=0.0.0.0 \
    SPID3R_PORT=8000

USER spid3r

EXPOSE 8000

# start-period must exceed the boot compile (~16-21s: the runtime compiles
# the whole .matrix graph before listening; measured 2026-11-21). 10s would
# mark healthy containers unhealthy mid-boot and cause restart loops.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${SPID3R_PORT}/health" >/dev/null || exit 1

# Migrate on boot (idempotent), then serve. `exec` hands PID 1 to the server
# so Ctrl+C / docker stop reach it directly.
CMD ["sh", "-c", "spid3r magic migrate && exec spid3r magic serve --port ${SPID3R_PORT}"]
