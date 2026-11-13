using System.Buffers.Binary;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Encodes PostgreSQL's row version as an opaque, portable API token.</summary>
public static class InvoiceConcurrencyToken
{
    public static string Encode(uint version)
    {
        Span<byte> bytes = stackalloc byte[sizeof(uint)];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, version);
        return Convert.ToBase64String(bytes);
    }

    public static bool TryDecode(string? token, out uint version)
    {
        version = default;

        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        Span<byte> bytes = stackalloc byte[sizeof(uint)];

        if (!Convert.TryFromBase64String(token, bytes, out var bytesWritten) ||
            bytesWritten != sizeof(uint))
        {
            return false;
        }

        version = BinaryPrimitives.ReadUInt32BigEndian(bytes);
        return true;
    }
}
