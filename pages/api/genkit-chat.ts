import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    // Increase to accommodate base64-encoded uploads (adds ~33% overhead)
    bodyParser: { sizeLimit: '128mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, context, conversationHistory, images } = req.body || {};

    console.log('🔍 [API] Received request body:', {
      message: message,
      contextKeys: context ? Object.keys(context) : [],
      contextSheetNames: context?.sheetNames,
      contextSheetData: context?.sheetData ? Object.keys(context.sheetData) : [],
      conversationHistoryLength: conversationHistory?.length || 0,
      imagesCount: images?.length || 0
    });

    if ((message == null || message === '') && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Process images into extracted file contents
    const extractedFileContents = images ? images.map((img: any) => ({
      type: img.mimeType,
      name: img.name,
      data: img.data,
      extractedText: img.data // For now, just pass the base64 data
    })) : [];

    // Prepare data for N8N webhook - match exact format expected
    const webhookData = {
      message: message || '',
      extractedFileContents: extractedFileContents,
      selectedSheets: context?.sheetNames || [],           // Match N8N expected format
      sheetDataSample: context?.sheetData || {},           // Match N8N expected format
      conversationHistory: conversationHistory || []
    };

    console.log('🔍 [API] Transformed webhook data:', {
      message: webhookData.message,
      selectedSheets: webhookData.selectedSheets,
      sheetDataSampleKeys: Object.keys(webhookData.sheetDataSample),
      conversationHistoryLength: webhookData.conversationHistory.length
    });

    // Get N8N webhook URL from environment
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    console.log('🔍 [N8N] Webhook URL:', n8nWebhookUrl);
    console.log('🔍 [N8N] Environment check - N8N_WEBHOOK_URL exists:', !!n8nWebhookUrl);
    console.log('🔍 [N8N] URL length:', n8nWebhookUrl?.length);
    console.log('🔍 [N8N] URL starts with https:', n8nWebhookUrl?.startsWith('https://'));
    console.log('🔍 [N8N] URL decoded:', decodeURIComponent(n8nWebhookUrl || ''));
    console.log('🔍 [N8N] Environment variables check:', {
      NODE_ENV: process.env.NODE_ENV,
      N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
      N8N_WEBHOOK_URL_length: process.env.N8N_WEBHOOK_URL?.length,
      allEnvVars: Object.keys(process.env).filter(key => key.includes('N8N') || key.includes('WEBHOOK'))
    });
    console.log('🔍 [N8N] URL validation:', {
      hasHttps: n8nWebhookUrl?.startsWith('https://'),
      hasWebhook: n8nWebhookUrl?.includes('/webhook/'),
      hasUUID: n8nWebhookUrl?.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/),
      endsWithSlash: n8nWebhookUrl?.endsWith('/'),
      totalLength: n8nWebhookUrl?.length
    });
    
    if (!n8nWebhookUrl) {
      throw new Error('N8N_WEBHOOK_URL not configured in environment');
    }

    // Test basic connectivity first
    console.log('🔍 [N8N] Testing basic connectivity...');
    try {
      const connectivityTest = await fetch(n8nWebhookUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      console.log('🔍 [N8N] Connectivity test result:', {
        status: connectivityTest.status,
        statusText: connectivityTest.statusText,
        ok: connectivityTest.ok
      });
    } catch (connectivityError) {
      console.log('🔍 [N8N] Connectivity test failed:', connectivityError);
    }

    // Test with minimal payload first
    console.log('🔍 [N8N] Testing with minimal payload...');
    try {
      const minimalPayload = { message: "test" };
      const minimalTest = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalPayload),
        signal: AbortSignal.timeout(10000)
      });
      console.log('🔍 [N8N] Minimal payload test result:', {
        status: minimalTest.status,
        statusText: minimalTest.statusText,
        ok: minimalTest.ok
      });
      if (minimalTest.ok) {
        console.log('🔍 [N8N] Minimal payload worked! The issue is with our full payload structure.');
      }
    } catch (minimalError) {
      console.log('🔍 [N8N] Minimal payload test failed:', minimalError);
    }

    // Test POST method since webhook expects POST
    console.log('🔍 [N8N] Testing POST method...');
    try {
      const testPayload = { message: "test" };
      const methodTest = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(5000)
      });
      console.log(`🔍 [N8N] POST method test:`, {
        status: methodTest.status,
        statusText: methodTest.statusText,
        ok: methodTest.ok
      });
    } catch (methodError) {
      console.log(`🔍 [N8N] POST method test failed:`, methodError);
    }

    // Enhanced logging for debugging
    console.log('🔍 [N8N] Request payload structure:', {
      message: webhookData.message,
      extractedFileContentsCount: webhookData.extractedFileContents.length,
      selectedSheets: webhookData.selectedSheets,
      sheetDataKeys: Object.keys(webhookData.sheetDataSample),
      conversationHistoryLength: webhookData.conversationHistory.length,
      hasFiles: images && images.length > 0,
      isExtraction: false
    });
    
    console.log('🔍 [N8N] Full webhook payload:', JSON.stringify(webhookData, null, 2));
    
    // Call N8N webhook with proper headers and timeout
    console.log('🚀 [N8N] Sending request to N8N webhook...');
    console.log('🚀 [N8N] Request details:', {
      method: 'POST',
      url: n8nWebhookUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ReportAI/1.0'
      },
      bodySize: JSON.stringify(webhookData).length,
      timeout: 30000
    });
    
    // Send POST request with JSON body
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    console.log('📡 [N8N] Response received:');
    console.log('  - Status:', n8nResponse.status);
    console.log('  - Status Text:', n8nResponse.statusText);
    console.log('  - Headers:', Object.fromEntries(n8nResponse.headers.entries()));
    console.log('  - URL called:', n8nWebhookUrl);

    if (!n8nResponse.ok) {
      // Enhanced error logging
      console.error('❌ [N8N] Webhook call failed:');
      console.error('  - Status:', n8nResponse.status);
      console.error('  - Status Text:', n8nResponse.statusText);
      console.error('  - URL:', n8nWebhookUrl);
      console.error('  - Payload sent:', JSON.stringify(webhookData, null, 2));
      
      // Try to get response body for more details
      let errorBody = '';
      try {
        errorBody = await n8nResponse.text();
        console.error('  - Error response body:', errorBody);
      } catch (e) {
        console.error('  - Could not read error response body:', e);
      }
      
      // Handle 404 errors gracefully with a fallback response
      if (n8nResponse.status === 404) {
        console.log('⚠️ [N8N] 404 error - providing fallback response');
        console.log('💡 [N8N] Debugging tips:');
        console.log('  1. Check if N8N workflow is active');
        console.log('  2. Verify webhook URL is correct');
        console.log('  3. Check N8N workflow logs');
        console.log('  4. Test webhook with Postman/curl');
        
        return res.status(200).json({
          intent: "query",
          reasoning: "N8N AI service is currently unavailable. Please try again later or contact support.",
          tables: [],
          clarifyQuestion: "The AI service is temporarily down. Would you like to try again in a few minutes?",
          insights: [
            "N8N webhook endpoint not found - workflow may need to be activated",
            "Check if the workflow is active in N8N dashboard",
            `Webhook URL: ${n8nWebhookUrl}`,
            `Status: ${n8nResponse.status} ${n8nResponse.statusText}`
          ],
          quickReplies: ["Try again", "Contact support", "Use basic features only"]
        });
      }
      
      throw new Error(`N8N webhook failed: ${n8nResponse.status} ${n8nResponse.statusText} - ${errorBody}`);
    }

    console.log('✅ [N8N] Webhook call successful, processing response...');
    
    let result;
    try {
      const responseText = await n8nResponse.text();
      console.log('📥 [N8N] Raw response text:', responseText);
      
      // Try to parse as JSON, with fallback for malformed responses
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ [N8N] JSON parse error:', parseError);
        console.error('❌ [N8N] Malformed response text:', responseText);
        
        // Try to fix common malformed JSON issues
        let fixedText = responseText.trim();
        if (!fixedText.startsWith('{')) {
          fixedText = '{' + fixedText;
        }
        if (!fixedText.endsWith('}')) {
          fixedText = fixedText + '}';
        }
        
        try {
          result = JSON.parse(fixedText);
          console.log('✅ [N8N] Successfully fixed malformed JSON');
        } catch (fixError) {
          console.error('❌ [N8N] Could not fix malformed JSON:', fixError);
          throw new Error(`N8N returned malformed JSON: ${responseText.substring(0, 100)}...`);
        }
      }
    } catch (error) {
      console.error('❌ [N8N] Failed to read response:', error);
      throw error;
    }
    
    console.log('📥 [N8N] Parsed response:', JSON.stringify(result, null, 2));
    
    // Handle array response from N8N and transform to expected format
    let n8nData = result;
    if (Array.isArray(result)) {
      n8nData = result[0]; // Take first item if it's an array
    }
    
    // Transform N8N response to match expected frontend format
    const transformedResult = {
      intent: n8nData.isExtraction ? "extraction" : "update_data",
      reasoning: n8nData.reasoning || n8nData.plannerPrompt || "AI processing completed",
      tables: n8nData.tables && Array.isArray(n8nData.tables) ? n8nData.tables : 
              (n8nData.extractedContents && n8nData.extractedContents.length > 0 ? n8nData.extractedContents : []),
      clarifyQuestion: n8nData.clarifyQuestion || null,
      insights: n8nData.insights || (n8nData.context?.sheetNames ? [`Processing data for sheets: ${n8nData.context.sheetNames.join(', ')}`] : []),
      quickReplies: n8nData.quickReplies || ["Continue", "Show data", "Add more"]
    };

    // Validate that we have the essential data
    if (!transformedResult.tables || transformedResult.tables.length === 0) {
      console.warn('⚠️ [N8N] Response missing tables data');
    }
    
    if (!transformedResult.reasoning) {
      console.warn('⚠️ [N8N] Response missing reasoning');
    }
    
    // Return the transformed N8N response
    return res.status(200).json({ success: true, ...transformedResult });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


