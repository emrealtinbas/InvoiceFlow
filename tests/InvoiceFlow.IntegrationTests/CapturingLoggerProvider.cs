using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace InvoiceFlow.IntegrationTests;

/// <summary>Captures log messages and structured scopes for observability assertions.</summary>
internal sealed class CapturingLoggerProvider : ILoggerProvider
{
    public ConcurrentQueue<string> Messages { get; } = new();

    public ConcurrentQueue<IReadOnlyDictionary<string, object?>> Scopes { get; } = new();

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(this);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(CapturingLoggerProvider provider) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull
        {
            if (state is IEnumerable<KeyValuePair<string, object?>> values)
            {
                provider.Scopes.Enqueue(values.ToDictionary(pair => pair.Key, pair => pair.Value));
            }

            return null;
        }

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            provider.Messages.Enqueue(formatter(state, exception));
        }
    }
}
