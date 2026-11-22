using System.Globalization;
using System.Text.Json.Nodes;

namespace PharmacyERP.Application.Common.Utilities;

/// <summary>
/// Produces deterministic canonical JSON and lowercase SHA-256 hex digests for idempotency
/// request-payload comparison by sorting object keys ordinally and normalizing decimal scale.
/// </summary>
public static class CanonicalJsonHasher
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new CanonicalDecimalJsonConverter() }
    };

    public static string SerializeToCanonicalJson<T>(T payload)
    {
        if (payload is null) return "null";

        var jsonNode = JsonSerializer.SerializeToNode(payload, Options);
        var sortedNode = SortNode(jsonNode);

        return sortedNode?.ToJsonString(Options) ?? "null";
    }

    public static string ComputeSha256Hex<T>(T payload)
    {
        var canonicalJson = SerializeToCanonicalJson(payload);
        var utf8Bytes = Encoding.UTF8.GetBytes(canonicalJson);
        var hashBytes = SHA256.HashData(utf8Bytes);

        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    private static JsonNode? SortNode(JsonNode? node)
    {
        if (node is JsonObject jsonObject)
        {
            var sortedObject = new JsonObject();
            foreach (var property in jsonObject.OrderBy(entry => entry.Key, StringComparer.Ordinal))
            {
                sortedObject[property.Key] = SortNode(property.Value?.DeepClone());
            }
            return sortedObject;
        }

        if (node is JsonArray jsonArray)
        {
            var clonedArray = new JsonArray();
            foreach (var item in jsonArray)
            {
                clonedArray.Add(SortNode(item?.DeepClone()));
            }
            return clonedArray;
        }

        return node?.DeepClone();
    }

    private sealed class CanonicalDecimalJsonConverter : JsonConverter<decimal>
    {
        public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => reader.GetDecimal();

        public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
        {
            // Dividing by 1.000... strips insignificant trailing fractional zeros so 10.0 and 10.00 hash identically.
            decimal normalizedValue = value / 1.000000000000000000000000000000000m;
            writer.WriteRawValue(normalizedValue.ToString("G29", CultureInfo.InvariantCulture));
        }
    }
}