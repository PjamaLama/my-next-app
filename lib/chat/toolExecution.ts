import { Context, ImageData } from './types';

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
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/genkit-tool-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCall, context, images })
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMessage = `Tool execution failed: ${response.status}`;
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
      } else {
        try {
          const errorText = await response.text();
          if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            errorMessage = `Server error (${response.status}): Received HTML error page`;
          } else {
            errorMessage = `Server error (${response.status}): ${errorText}`;
          }
        } catch {}
      }
      throw new Error(errorMessage);
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
      toolId: toolCall.id
    };
  } catch (error) {
    return {
      success: false,
      result: `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: null,
      toolId: toolCall.id
    };
  }
}


