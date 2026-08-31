namespace Rider.Application.Helpers
{
    public interface IPasswordCrypto
    {
        byte[]? Encrypt(string plainText);
        string? Decrypt(byte[]? cipherText);
    }
}
