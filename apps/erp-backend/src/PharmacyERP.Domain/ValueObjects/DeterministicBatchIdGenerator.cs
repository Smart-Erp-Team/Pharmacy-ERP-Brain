using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace PharmacyERP.Domain.ValueObjects;

public static class DeterministicBatchIdGenerator
{
	private static readonly Guid NamespaceId = Guid.Parse("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
	private static readonly JsonSerializerOptions CanonicalJsonOptions = new()
	{
		Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
	};

	public const string NonLotBatchNumber = "NON-LOT";

	public static Guid Generate(Guid organizationId, Guid productId, string batchNumber, DateOnly? expiresOn)
	{
		string batchJson = JsonSerializer.Serialize(batchNumber, CanonicalJsonOptions);

		string expiresOnJson = expiresOn.HasValue ? $"\"{expiresOn.Value:yyyy-MM-dd}\"" : "null";

		string jsonPayload = $"{{\"organization_id\":\"{organizationId:d}\",\"product_id\":\"{productId:d}\",\"batch_number\":{batchJson},\"expires_on\":{expiresOnJson}}}";

		byte[] nameBytes = Encoding.UTF8.GetBytes(jsonPayload);

		byte[] namespaceBytes = NamespaceId.ToByteArray();
		SwapToNetworkByteOrder(namespaceBytes);

		byte[] dataToHash = new byte[16 + nameBytes.Length];
		Buffer.BlockCopy(namespaceBytes, 0, dataToHash, 0, 16);
		Buffer.BlockCopy(nameBytes, 0, dataToHash, 16, nameBytes.Length);

		byte[] hash = SHA1.HashData(dataToHash);

		byte[] newGuidBytes = new byte[16];
		Buffer.BlockCopy(hash, 0, newGuidBytes, 0, 16);

		newGuidBytes[6] = (byte)((newGuidBytes[6] & 0x0F) | 0x50);

		newGuidBytes[8] = (byte)((newGuidBytes[8] & 0x3F) | 0x80);

		SwapToNetworkByteOrder(newGuidBytes);

		return new Guid(newGuidBytes);
	}

	public static Guid GenerateNonLotBatchId(Guid organizationId, Guid productId)
	{
		return Generate(organizationId, productId, NonLotBatchNumber, null);
	}

	private static void SwapToNetworkByteOrder(byte[] guidBytes)
	{
		Swap(guidBytes, 0, 3);
		Swap(guidBytes, 1, 2);
		Swap(guidBytes, 4, 5);
		Swap(guidBytes, 6, 7);
	}

	private static void Swap(byte[] bytes, int left, int right)
	{
		byte temp = bytes[left];
		bytes[left] = bytes[right];
		bytes[right] = temp;
	}
}