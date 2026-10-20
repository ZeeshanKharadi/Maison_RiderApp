using System.Text.Json;
using Rider.Application.Serialization;
using Xunit;

namespace Rider.Tests;

public class UtcDateTimeJsonConverterTests
{
    private static readonly JsonSerializerOptions Options = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var o = new JsonSerializerOptions();
        o.Converters.Add(new UtcDateTimeJsonConverter());
        o.Converters.Add(new UtcNullableDateTimeJsonConverter());
        return o;
    }

    private sealed class Sample
    {
        public DateTime createdAt { get; set; }
        public DateTime? updatedAt { get; set; }
    }

    [Fact]
    public void Unspecified_Utc_wall_clock_emits_Z()
    {
        var dto = new Sample
        {
            createdAt = new DateTime(2026, 10, 14, 10, 7, 0, DateTimeKind.Unspecified),
            updatedAt = new DateTime(2026, 10, 14, 11, 40, 0, DateTimeKind.Unspecified)
        };

        var json = JsonSerializer.Serialize(dto, Options);

        Assert.Contains("\"createdAt\":\"2026-10-14T10:07:00", json);
        Assert.Contains("Z\"", json);
        Assert.Contains("\"updatedAt\":\"2026-10-14T11:40:00", json);
        Assert.DoesNotContain("\"createdAt\":\"2026-10-14T10:07:00\"", json); // must not omit Z
    }

    [Fact]
    public void Bare_ISO_deserializes_as_Utc_Kind()
    {
        const string json = """{"createdAt":"2026-10-14T10:07:00","updatedAt":null}""";
        var dto = JsonSerializer.Deserialize<Sample>(json, Options)!;
        Assert.Equal(DateTimeKind.Utc, dto.createdAt.Kind);
        Assert.Equal(10, dto.createdAt.Hour);
        Assert.Null(dto.updatedAt);
    }
}
