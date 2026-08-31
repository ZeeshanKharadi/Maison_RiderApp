using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Rider.Application.Helpers;

namespace Rider.Infrastructure.Helpers
{
    /// <summary>
    /// ESS AES password crypto — IV prepended to ciphertext (varbinary).
    /// </summary>
    public class PasswordCrypto : IPasswordCrypto
    {
        private readonly string _keyString;

        public PasswordCrypto(IConfiguration configuration)
        {
            _keyString = configuration["EncryptionKey:key"]
                ?? "r3Bq4w7Q8M8y1lP2zF+0x9vX0pF4oZk8sY6Hk9Qv8cE=";
        }

        public byte[]? Encrypt(string plainText)
        {
            if (string.IsNullOrEmpty(plainText))
                return null;

            byte[] keyBytes = GetKeyBytes(_keyString);

            using (Aes aesAlg = Aes.Create())
            {
                aesAlg.Key = keyBytes;
                aesAlg.GenerateIV();

                using (MemoryStream msEncrypt = new MemoryStream())
                {
                    msEncrypt.Write(aesAlg.IV, 0, aesAlg.IV.Length);
                    using (CryptoStream csEncrypt = new CryptoStream(msEncrypt, aesAlg.CreateEncryptor(), CryptoStreamMode.Write))
                    using (StreamWriter swEncrypt = new StreamWriter(csEncrypt))
                    {
                        swEncrypt.Write(plainText);
                    }
                    return msEncrypt.ToArray();
                }
            }
        }

        public string? Decrypt(byte[]? cipherText)
        {
            if (cipherText == null || cipherText.Length == 0)
                return null;

            byte[] keyBytes = GetKeyBytes(_keyString);

            using (MemoryStream msDecrypt = new MemoryStream(cipherText))
            {
                byte[] iv = new byte[16];
                msDecrypt.Read(iv, 0, iv.Length);

                using (Aes aesAlg = Aes.Create())
                {
                    aesAlg.Key = keyBytes;
                    aesAlg.IV = iv;

                    using (CryptoStream csDecrypt = new CryptoStream(msDecrypt, aesAlg.CreateDecryptor(), CryptoStreamMode.Read))
                    using (StreamReader srDecrypt = new StreamReader(csDecrypt))
                    {
                        return srDecrypt.ReadToEnd();
                    }
                }
            }
        }

        private static byte[] GetKeyBytes(string keyString)
        {
            try
            {
                byte[] keyBytes = Convert.FromBase64String(keyString);
                if (keyBytes.Length == 16 || keyBytes.Length == 24 || keyBytes.Length == 32)
                    return keyBytes;
                using (SHA256 sha256 = SHA256.Create())
                    return sha256.ComputeHash(keyBytes);
            }
            catch (FormatException)
            {
                using (SHA256 sha256 = SHA256.Create())
                    return sha256.ComputeHash(Encoding.UTF8.GetBytes(keyString));
            }
        }
    }
}
