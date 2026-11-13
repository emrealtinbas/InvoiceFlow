# API examples

This walkthrough uses the Docker Compose URL, `http://localhost:8080`. Replace placeholders such as
`<access-token>`, `<customer-id>`, `<invoice-id>`, and `<concurrency-token>` with values returned by the API.
Dates are ISO 8601 calendar dates. Dynamic GUIDs, timestamps, invoice numbers, and tokens are illustrative
placeholders rather than fixed values.

## 1. Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "demo-user@example.invalid",
  "password": "<strong-disposable-password>"
}
```

```http
HTTP/1.1 201 Created
```

```json
{
  "id": "<user-id>",
  "email": "demo-user@example.invalid",
  "role": "User"
}
```

Registration does not return a token and cannot create an Admin.

## 2. Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "demo-user@example.invalid",
  "password": "<strong-disposable-password>"
}
```

```http
HTTP/1.1 200 OK
```

```json
{
  "accessToken": "<access-token>",
  "tokenType": "Bearer",
  "expiresIn": 1800
}
```

## 3. Retrieve the authenticated user

```http
GET /api/auth/me
Authorization: Bearer <access-token>
```

```json
{
  "id": "<user-id>",
  "email": "demo-user@example.invalid",
  "roles": ["User"]
}
```

## 4. Create a customer

The customer needs an e-mail address before an invoice can be sent.

```http
POST /api/customers
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "Northwind Demo Studio",
  "email": "billing@example.invalid",
  "phone": "+90 555 000 00 00",
  "address": "Istanbul, Türkiye",
  "taxNumber": "1234567890"
}
```

```http
HTTP/1.1 201 Created
```

```json
{
  "id": "<customer-id>",
  "name": "Northwind Demo Studio",
  "email": "billing@example.invalid",
  "phone": "+90 555 000 00 00",
  "address": "Istanbul, Türkiye",
  "taxNumber": "1234567890",
  "createdAt": "<utc-timestamp>",
  "updatedAt": null
}
```

## 5. Create a multi-item invoice

The server generates the invoice number, fixes currency to TRY, and calculates every line and invoice total.

```http
POST /api/invoices
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "customerId": "<customer-id>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "items": [
    {
      "description": "API implementation",
      "quantity": 2.5,
      "unitPrice": 1200.00,
      "taxRate": 20.00
    },
    {
      "description": "Integration testing",
      "quantity": 3,
      "unitPrice": 450.00,
      "taxRate": 10.00
    }
  ]
}
```

```http
HTTP/1.1 201 Created
```

```json
{
  "id": "<invoice-id>",
  "invoiceNumber": "<generated-invoice-number>",
  "customerId": "<customer-id>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "status": "Draft",
  "currency": "TRY",
  "subtotal": 4350.00,
  "taxTotal": 735.00,
  "grandTotal": 5085.00,
  "createdAt": "<utc-timestamp>",
  "updatedAt": null,
  "concurrencyToken": "<concurrency-token>",
  "items": [
    {
      "id": "<invoice-item-id-1>",
      "description": "API implementation",
      "quantity": 2.5,
      "unitPrice": 1200.00,
      "taxRate": 20.00,
      "lineSubtotal": 3000.00,
      "lineTax": 600.00,
      "lineTotal": 3600.00
    },
    {
      "id": "<invoice-item-id-2>",
      "description": "Integration testing",
      "quantity": 3,
      "unitPrice": 450.00,
      "taxRate": 10.00,
      "lineSubtotal": 1350.00,
      "lineTax": 135.00,
      "lineTotal": 1485.00
    }
  ]
}
```

## 6. Retrieve the invoice

```http
GET /api/invoices/<invoice-id>
Authorization: Bearer <access-token>
```

```http
HTTP/1.1 200 OK
```

The response uses the same full invoice shape shown above and contains the latest `concurrencyToken`.

## 7. Update the Draft

`PUT` fully replaces the mutable Draft fields and its items. Always use the latest token from a prior
response.

```http
PUT /api/invoices/<invoice-id>
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "customerId": "<customer-id>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "concurrencyToken": "<concurrency-token>",
  "items": [
    {
      "description": "API implementation",
      "quantity": 2.5,
      "unitPrice": 1200.00,
      "taxRate": 20.00
    },
    {
      "description": "Integration testing and review",
      "quantity": 4,
      "unitPrice": 450.00,
      "taxRate": 10.00
    }
  ]
}
```

```http
HTTP/1.1 200 OK
```

The recalculated totals are `subtotal: 4800.00`, `taxTotal: 780.00`, and `grandTotal: 5580.00`. The response
contains a fresh concurrency token.

## 8. Send the invoice

```http
POST /api/invoices/<invoice-id>/send
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "concurrencyToken": "<fresh-token-from-update>"
}
```

```http
HTTP/1.1 200 OK
```

The full invoice response has `status: "Sent"` and another fresh token. Items and financial totals are
unchanged.

## 9. Mark the invoice Paid

This is a manual lifecycle status change, not a payment transaction.

```http
POST /api/invoices/<invoice-id>/mark-paid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "concurrencyToken": "<fresh-token-from-send>"
}
```

```http
HTTP/1.1 200 OK
```

The response has `status: "Paid"`. Paid and Cancelled are terminal states.

## 10. Verify terminal-state behavior

Trying to update the Paid invoice is rejected even when the newest token is supplied:

```http
PUT /api/invoices/<invoice-id>
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "customerId": "<customer-id>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "concurrencyToken": "<fresh-token-from-mark-paid>",
  "items": [
    {
      "description": "API implementation",
      "quantity": 2.5,
      "unitPrice": 1200.00,
      "taxRate": 20.00
    }
  ]
}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
```

```json
{
  "type": "<problem-type-uri>",
  "title": "Conflict",
  "status": 409,
  "detail": "Only Draft invoices can be updated.",
  "instance": "/api/invoices/<invoice-id>",
  "traceId": "<trace-id>",
  "correlationId": "<correlation-id>"
}
```

Invalid lifecycle transitions and stale concurrency tokens also return `409`. Inaccessible resources owned
by another user return `404` rather than disclosing their existence.
