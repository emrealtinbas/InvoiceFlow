# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: restore, compile, and publish the API in Release configuration.
# The SDK is never present in the runtime image.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy only restore inputs first so dependency layers survive source-only edits.
# .editorconfig is required because it tunes analyzer severities for the build.
COPY global.json Directory.Build.props .editorconfig dotnet-tools.json ./
COPY src/InvoiceFlow.Api/InvoiceFlow.Api.csproj src/InvoiceFlow.Api/

RUN dotnet restore src/InvoiceFlow.Api/InvoiceFlow.Api.csproj

COPY src/ src/

RUN dotnet publish src/InvoiceFlow.Api/InvoiceFlow.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

# ---------------------------------------------------------------------------
# Migration bundle stage: produces a one-off EF Core migration executable.
# The connection string below is a non-secret design-time placeholder; the real
# connection string is supplied at run time with --connection.
# ---------------------------------------------------------------------------
FROM build AS migration-build
ENV ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=design;Username=design;Password=design"

RUN dotnet tool restore
RUN dotnet tool run dotnet-ef migrations bundle \
    --project src/InvoiceFlow.Api/InvoiceFlow.Api.csproj \
    --startup-project src/InvoiceFlow.Api/InvoiceFlow.Api.csproj \
    --configuration Release \
    --output /app/migrations.bundle \
    --force

# ---------------------------------------------------------------------------
# Runtime base: official ASP.NET Core runtime, unprivileged port, non-root user.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# ---------------------------------------------------------------------------
# Migrator image: runtime + EF Core migration bundle + explicit runner script.
# Used only through `docker compose run --rm migrator`; never started by `up`.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS migrator
WORKDIR /app
COPY --from=migration-build --chown=app:app /app/migrations.bundle ./migrations.bundle
COPY --chown=app:app scripts/migrate.sh ./migrate.sh
RUN chmod +x ./migrate.sh
USER app
ENTRYPOINT ["./migrate.sh"]

# ---------------------------------------------------------------------------
# Final API image: published output only, runs as the built-in non-root "app" user.
# This is the last stage so a plain `docker build .` produces the API image.
# ---------------------------------------------------------------------------
FROM base AS final
COPY --from=build --chown=app:app /app/publish ./
USER app

# HTTP readiness probe implemented with bash's /dev/tcp, because the runtime
# image intentionally contains no curl or wget.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080; printf "GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n" >&3; IFS= read -r -t 3 line <&3; [[ "$line" == *"200"* ]]'

ENTRYPOINT ["dotnet", "InvoiceFlow.Api.dll"]
