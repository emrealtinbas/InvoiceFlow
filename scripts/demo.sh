#!/usr/bin/env bash
# Runs a non-destructive InvoiceFlow workflow against the local Docker Compose API.
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
API_URL="${API_URL%/}"

for command in curl jq date; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Required command not found: $command" >&2
        exit 1
    fi
done

response_file="$(mktemp "${TMPDIR:-/tmp}/invoiceflow-demo.XXXXXX")"
chmod 600 "$response_file"
trap 'rm -f "$response_file"' EXIT

request_json() {
    local method="$1"
    local path="$2"
    local expected_status="$3"
    local body="${4:-}"
    local bearer_token="${5:-}"
    local status
    local -a arguments=(
        --silent
        --show-error
        --output "$response_file"
        --write-out "%{http_code}"
        --request "$method"
        --header "Accept: application/json"
    )

    if [[ -n "$body" ]]; then
        arguments+=(--header "Content-Type: application/json" --data-binary @-)
    fi

    if [[ -n "$bearer_token" ]]; then
        arguments+=(--header "Authorization: Bearer $bearer_token")
    fi

    if [[ -n "$body" ]]; then
        status="$(printf '%s' "$body" | curl "${arguments[@]}" "$API_URL$path")"
    else
        status="$(curl "${arguments[@]}" "$API_URL$path")"
    fi

    if [[ "$status" != "$expected_status" ]]; then
        echo "Request failed: $method $path returned HTTP $status; expected $expected_status." >&2
        jq . "$response_file" >&2 2>/dev/null || cat "$response_file" >&2
        exit 1
    fi
}

echo "Checking InvoiceFlow readiness..."
health_status="$(
    curl --silent --show-error --output "$response_file" --write-out "%{http_code}" \
        "$API_URL/health"
)"

if [[ "$health_status" != "200" ]]; then
    echo "InvoiceFlow is not ready at $API_URL (HTTP $health_status)." >&2
    echo "Start Compose and apply migrations before running this demo:" >&2
    echo "  docker compose up -d --build" >&2
    echo "  docker compose run --rm migrator" >&2
    exit 1
fi

run_id="$(date -u +%Y%m%d%H%M%S)-$$"
issue_date="$(date -u +%Y-%m-%d)"
email="invoiceflow-demo-${run_id}@example.invalid"
customer_email="billing-${run_id}@example.invalid"
password="Demo-${run_id}-Aa9!"

echo "Registering disposable demo user..."
register_body="$(
    jq -cn \
        --arg email "$email" \
        --arg password "$password" \
        '{email: $email, password: $password}'
)"
request_json POST "/api/auth/register" 201 "$register_body"

echo "Authenticating demo user..."
login_body="$(
    jq -cn \
        --arg email "$email" \
        --arg password "$password" \
        '{email: $email, password: $password}'
)"
request_json POST "/api/auth/login" 200 "$login_body"
access_token="$(jq -er '.accessToken' "$response_file")"

request_json GET "/api/auth/me" 200 "" "$access_token"
user_id="$(jq -er '.id' "$response_file")"

echo "Creating customer..."
customer_body="$(
    jq -cn \
        --arg name "InvoiceFlow Demo ${run_id}" \
        --arg email "$customer_email" \
        '{
            name: $name,
            email: $email,
            phone: "+90 555 000 00 00",
            address: "Istanbul, Türkiye",
            taxNumber: "1234567890"
        }'
)"
request_json POST "/api/customers" 201 "$customer_body" "$access_token"
customer_id="$(jq -er '.id' "$response_file")"

echo "Creating multi-item Draft invoice..."
create_invoice_body="$(
    jq -cn \
        --arg customerId "$customer_id" \
        --arg issueDate "$issue_date" \
        '{
            customerId: $customerId,
            issueDate: $issueDate,
            dueDate: $issueDate,
            items: [
                {
                    description: "API implementation",
                    quantity: 2.5,
                    unitPrice: 1200.00,
                    taxRate: 20.00
                },
                {
                    description: "Integration testing",
                    quantity: 3,
                    unitPrice: 450.00,
                    taxRate: 10.00
                }
            ]
        }'
)"
request_json POST "/api/invoices" 201 "$create_invoice_body" "$access_token"

jq -e '
    .status == "Draft" and
    .currency == "TRY" and
    .subtotal == 4350 and
    .taxTotal == 735 and
    .grandTotal == 5085 and
    (.items | length) == 2
' "$response_file" >/dev/null

invoice_id="$(jq -er '.id' "$response_file")"
invoice_number="$(jq -er '.invoiceNumber' "$response_file")"
concurrency_token="$(jq -er '.concurrencyToken' "$response_file")"

echo "Draft $invoice_number calculated: subtotal 4350.00, tax 735.00, total 5085.00 TRY."
echo "Updating Draft and recalculating totals..."
update_invoice_body="$(
    jq -cn \
        --arg customerId "$customer_id" \
        --arg issueDate "$issue_date" \
        --arg concurrencyToken "$concurrency_token" \
        '{
            customerId: $customerId,
            issueDate: $issueDate,
            dueDate: $issueDate,
            concurrencyToken: $concurrencyToken,
            items: [
                {
                    description: "API implementation",
                    quantity: 2.5,
                    unitPrice: 1200.00,
                    taxRate: 20.00
                },
                {
                    description: "Integration testing and review",
                    quantity: 4,
                    unitPrice: 450.00,
                    taxRate: 10.00
                }
            ]
        }'
)"
request_json PUT "/api/invoices/$invoice_id" 200 "$update_invoice_body" "$access_token"

jq -e '
    .status == "Draft" and
    .subtotal == 4800 and
    .taxTotal == 780 and
    .grandTotal == 5580
' "$response_file" >/dev/null
concurrency_token="$(jq -er '.concurrencyToken' "$response_file")"

echo "Sending invoice..."
lifecycle_body="$(jq -cn --arg token "$concurrency_token" '{concurrencyToken: $token}')"
request_json POST "/api/invoices/$invoice_id/send" 200 "$lifecycle_body" "$access_token"
jq -e '.status == "Sent" and .grandTotal == 5580' "$response_file" >/dev/null
concurrency_token="$(jq -er '.concurrencyToken' "$response_file")"

echo "Marking invoice Paid..."
lifecycle_body="$(jq -cn --arg token "$concurrency_token" '{concurrencyToken: $token}')"
request_json POST "/api/invoices/$invoice_id/mark-paid" 200 "$lifecycle_body" "$access_token"
jq -e '.status == "Paid" and .grandTotal == 5580' "$response_file" >/dev/null
concurrency_token="$(jq -er '.concurrencyToken' "$response_file")"

echo "Verifying terminal-state protection..."
terminal_update_body="$(
    jq -cn \
        --arg customerId "$customer_id" \
        --arg issueDate "$issue_date" \
        --arg concurrencyToken "$concurrency_token" \
        '{
            customerId: $customerId,
            issueDate: $issueDate,
            dueDate: $issueDate,
            concurrencyToken: $concurrencyToken,
            items: [
                {
                    description: "Rejected terminal update",
                    quantity: 1,
                    unitPrice: 1.00,
                    taxRate: 0.00
                }
            ]
        }'
)"
request_json PUT "/api/invoices/$invoice_id" 409 "$terminal_update_body" "$access_token"
jq -e '.status == 409' "$response_file" >/dev/null

echo "Demo completed successfully."
echo "User: $email"
echo "User ID: $user_id"
echo "Customer ID: $customer_id"
echo "Invoice: $invoice_number ($invoice_id), status Paid, total 5580.00 TRY"
echo "The disposable password and JWT were not printed. No existing data was modified or deleted."
