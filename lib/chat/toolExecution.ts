import { Context, ImageData } from './types';

function resolveBaseUrl(): string {
  // In the browser, use relative URLs
  if (typeof window !== 'undefined') return '';
  // Prefer explicit site URL
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/$/, '');
  // Fallback to platform-provided host (e.g., Vercel)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, '');
  // Last resort: localhost (dev)
  return 'http://localhost:3000';
}

export async function executeToolCall(
  toolCall: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  },
  context: Context,
  images: ImageData[] = []
) {
  try {
    // Prefer a request-scoped base URL passed via context when running server-side
    const scopedBase = (typeof window === 'undefined' && context && (context as any)._baseUrl)
      ? String((context as any)._baseUrl)
      : undefined;
    const baseUrl = scopedBase || resolveBaseUrl();
    const url = `${baseUrl}/api/genkit-tool-execute`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCall, context, images })
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMessage = `Tool execution failed: ${response.status}`;
      let errorDetails: unknown = undefined;
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          errorDetails = errorData.details ?? errorData;
        } catch {}
      } else {
        try {
          const errorText = await response.text();
          if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            errorMessage = `Server error (${response.status}): Received HTML error page`;
          } else {
            errorMessage = `Server error (${response.status}): ${errorText}`;
          }
          errorDetails = errorText;
        } catch {}
      }
      // Log server-side for visibility in production logs
      // eslint-disable-next-line no-console
      console.error('[ToolExecution] HTTP error', { url, status: response.status, errorMessage, errorDetails });
      return {
        success: false,
        result: `Error executing ${toolCall.function.name}: ${errorMessage}`,
        details: errorDetails ?? null,
        toolId: toolCall.id
      };
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid JSON response from tool execution');
    }
    return {
      success: data.success,
      result: data.result,
      details: data.details,
      analyses: data.analyses,
      extractions: data.extractions,
      data: data.data,
      flowPreview: (data as any)?.flowPreview,
      actions: (data as any)?.actions,
      toolId: toolCall.id
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[ToolExecution] Exception', error);
    return {
      success: false,
      result: `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? (error.stack || error.message) : null,
      toolId: toolCall.id
    };
  }
}


