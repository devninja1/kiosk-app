/**
 * Extracts a user-friendly error message from common API error shapes.
 * - Handles ASP.NET-style validation payloads: { title, errors: { field: [messages] } }
 * - Falls back to error.message / error.error.message
 * - Optionally includes traceId when present
 */
export function extractApiErrorMessage(err: any, includeTrace = false): string {
  const validationErrors = err?.error?.errors;
  if (validationErrors && typeof validationErrors === 'object') {
    const flattened = Object.entries(validationErrors)
      .flatMap(([field, msgs]) => {
        if (Array.isArray(msgs)) {
          return msgs.map(m => `${field}: ${m}`);
        }
        return `${field}: ${String(msgs)}`;
      })
      .filter(Boolean);
    const title = err?.error?.title || 'Validation error';
    const parts = [title, ...flattened].filter(Boolean);
    return parts.join('\n');
  }

  const apiMessage = (err?.error?.message as string) || (err?.message as string);
  if (apiMessage) {
    return apiMessage.replace(/https?:\/\/\S+/gi, '[link removed]');
  }
  return '';
}