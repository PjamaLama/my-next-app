import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // GET method for debugging environment and configuration
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    const envCheck = {
      N8N_WEBHOOK_URL: n8nWebhookUrl,
      N8N_WEBHOOK_URL_exists: !!n8nWebhookUrl,
      N8N_WEBHOOK_URL_length: n8nWebhookUrl ? n8nWebhookUrl.length : 0,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      allEnvVars: Object.keys(process.env).filter(key => key.includes('N8N') || key.includes('WEBHOOK'))
    };
    
    console.log('🔍 [TEST-N8N] Environment check:', envCheck);
    
    return res.status(200).json({
      message: 'N8N Configuration Check',
      ...envCheck,
      debugging: {
        message: 'Use POST method to test the webhook',
        suggestions: [
          'Check if N8N_WEBHOOK_URL is set correctly',
          'Verify the URL format matches your N8N instance',
          'Ensure the workflow is active in N8N'
        ]
      }
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET for config check or POST for webhook test' });
  }

  if (req.method === 'POST') {
    // Log the exact request body structure for debugging
    console.log('🧪 [TEST-N8N] POST request received');
    console.log('🧪 [TEST-N8N] Request body:', JSON.stringify(req.body, null, 2));
    console.log('🧪 [TEST-N8N] Request headers:', Object.fromEntries(Object.entries(req.headers)));
    
    // If this is a test request from the frontend, just return the logged data
    if (req.body?.test === true) {
      return res.status(200).json({
        message: 'Frontend data structure logged',
        receivedData: req.body,
        timestamp: new Date().toISOString()
      });
    }
    
    // Otherwise, proceed with N8N webhook test
    try {
      // First, test basic connectivity to the URL
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!n8nWebhookUrl) {
        throw new Error('N8N_WEBHOOK_URL not configured in environment');
      }

      console.log('🧪 [TEST-N8N] Testing basic connectivity to:', n8nWebhookUrl);
      
      // Test basic connectivity with a HEAD request
      try {
        const connectivityTest = await fetch(n8nWebhookUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000) // 5 second timeout for connectivity
        });
        console.log('🧪 [TEST-N8N] Connectivity test result:', {
          status: connectivityTest.status,
          statusText: connectivityTest.statusText,
          headers: Object.fromEntries(connectivityTest.headers.entries())
        });
      } catch (connectivityError) {
        console.log('🧪 [TEST-N8N] Connectivity test failed:', connectivityError);
      }

      // Test data for N8N webhook - EXACTLY matching genkit-chat format
      const testData = {
        message: "Add fuel entry: 50L diesel, 500km, $80",
        extractedFileContents: [],
        selectedSheets: ["Logbook"],           // Match genkit-chat format
        sheetDataSample: {                     // Match genkit-chat format
          "Logbook": [
            ["Date", "Fuel Type", "Amount (L)", "Distance (km)", "Cost ($)"],
            ["2024-01-15", "Diesel", "45", "480", "72"]
          ]
        },
        conversationHistory: [
          { role: "user", content: "Add fuel entry: 50L diesel, 500km, $80", timestamp: Date.now() }
        ]
      };

      console.log('🧪 [TEST-N8N] Testing N8N webhook:', n8nWebhookUrl);
      console.log('🧪 [TEST-N8N] Test data structure:', {
        message: testData.message,
        extractedFileContentsCount: testData.extractedFileContents.length,
        selectedSheets: testData.selectedSheets,
        sheetDataKeys: Object.keys(testData.sheetDataSample),
        conversationHistoryLength: testData.conversationHistory.length
      });
      console.log('🧪 [TEST-N8N] Full test data:', JSON.stringify(testData, null, 2));

      // Call N8N webhook with POST method and JSON body
      console.log('🚀 [TEST-N8N] Sending request to N8N webhook...');
      
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ReportAI/1.0'
        },
        body: JSON.stringify(testData),
      });

      console.log('📡 [TEST-N8N] Response received:');
      console.log('  - Status:', n8nResponse.status);
      console.log('  - Status Text:', n8nResponse.statusText);
      console.log('  - Headers:', Object.fromEntries(n8nResponse.headers.entries()));
      console.log('  - URL called:', n8nWebhookUrl);

      let responseBody = '';
      try {
        responseBody = await n8nResponse.text();
        console.log('📥 [TEST-N8N] Response body:', responseBody);
      } catch (e) {
        responseBody = 'Could not read response body';
        console.error('❌ [TEST-N8N] Error reading response body:', e);
      }

      if (!n8nResponse.ok) {
        console.error('❌ [TEST-N8N] Webhook test failed:');
        console.error('  - Status:', n8nResponse.status);
        console.error('  - Status Text:', n8nResponse.statusText);
        console.error('  - URL:', n8nWebhookUrl);
        console.error('  - Payload sent:', JSON.stringify(testData, null, 2));
        console.error('  - Response body:', responseBody);
        
        return res.status(500).json({
          error: 'N8N webhook test failed',
          status: n8nResponse.status,
          statusText: n8nResponse.statusText,
          headers: Object.fromEntries(n8nResponse.headers.entries()),
          responseBody: responseBody,
          webhookUrl: n8nWebhookUrl,
          testData: testData,
          debugging: {
            message: 'Test failed - check N8N workflow status and webhook URL',
            suggestions: [
              'Verify N8N workflow is active',
              'Check webhook URL is correct',
              'Review N8N workflow logs',
              'Test with Postman/curl to confirm webhook works'
            ]
          }
        });
      }

      console.log('✅ [TEST-N8N] Webhook test successful!');
      
      let result;
      try {
        result = JSON.parse(responseBody);
      } catch (e) {
        result = { rawResponse: responseBody };
        console.warn('⚠️ [TEST-N8N] Could not parse response as JSON, using raw response');
      }
      
      return res.status(200).json({ 
        success: true, 
        message: 'N8N webhook test successful',
        status: n8nResponse.status,
        headers: Object.fromEntries(n8nResponse.headers.entries()),
        n8nResponse: result,
        webhookUrl: n8nWebhookUrl,
        testData: testData
      });
    } catch (error) {
      console.error('❌ [TEST-N8N] Test error:', error);
      return res.status(500).json({
        error: 'Failed to test N8N webhook',
        details: error instanceof Error ? error.message : String(error),
        debugging: {
          message: 'Test execution failed',
          suggestions: [
            'Check server logs for detailed error',
            'Verify environment variables are set',
            'Ensure N8N_WEBHOOK_URL is configured'
          ]
        }
      });
    }
  }
}
