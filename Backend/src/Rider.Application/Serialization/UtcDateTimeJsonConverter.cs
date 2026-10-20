using System.Text.Json;
using System.Text.Json.Serialization;

namespace Rider.Application.Serialization
{
    /// <summary>
    /// EF/SQL returns UTC wall-clock as <see cref="DateTimeKind.Unspecified"/>.
    /// Default System.Text.Json then omits "Z", and JS clients treat the value as local
    /// (e.g. +5h "ago" skew in Pakistan). Always emit/parse as UTC.
    /// </summary>
    public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            var value = reader.GetDateTime();
            return value.Kind == DateTimeKind.Utc
                ? value
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        {
            var utc = value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };
            // Quoted 'Z' so the format is a literal, not a custom specifier.
            writer.WriteStringValue(utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'"));
        }
    }

    public sealed class UtcNullableDateTimeJsonConverter : JsonConverter<DateTime?>
    {
        private static readonly UtcDateTimeJsonConverter Inner = new();

        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null)
                return null;
            return Inner.Read(ref reader, typeof(DateTime), options);
        }

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is null)
            {
                writer.WriteNullValue();
                return;
            }
            Inner.Write(writer, value.Value, options);
        }
    }
}
