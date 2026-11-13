#!/usr/bin/env bash
# Applies all committed EF Core migrations exactly once per invocation.
# The migration bundle is framework-dependent and runs on the ASP.NET runtime
# image; no .NET SDK is required in this container.
set -euo pipefail

if [[ -z "${ConnectionStrings__DefaultConnection:-}" ]]; then
  echo "ConnectionStrings__DefaultConnection is required." >&2
  exit 1
fi

exec /app/migrations.bundle --connection "$ConnectionStrings__DefaultConnection"
