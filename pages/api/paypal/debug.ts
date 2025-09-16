import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Content-Type', 'text/html');

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>PayPal Debug - SheetyAI</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .button { background: #0070ba; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 10px 0; }
        .button:hover { background: #005ea6; }
        .code { background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; margin: 10px 0; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 PayPal Debug - SheetyAI</h1>
        <p>Use this page to test your PayPal integration and credentials.</p>

        <div class="status info">
            <strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}<br>
            <strong>PayPal Mode:</strong> ${process.env.NODE_ENV === 'production' ? 'Live (Production)' : 'Sandbox (Development)'}<br>
            <strong>PayPal URL:</strong> ${process.env.NODE_ENV === 'production' ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com'}
        </div>

        <h2>📋 Environment Variables Status</h2>
        <div class="code">
${process.env.NODE_ENV === 'production' ? 'Production' : 'Sandbox'} Credentials:<br>
PAYPAL_CLIENT_ID: ${process.env.PAYPAL_CLIENT_ID ? '✅ Set (' + process.env.PAYPAL_CLIENT_ID.length + ' chars)' : '❌ Missing'}<br>
PAYPAL_SECRET_KEY: ${process.env.PAYPAL_SECRET_KEY ? '✅ Set (' + process.env.PAYPAL_SECRET_KEY.length + ' chars)' : '❌ Missing'}<br>
PAYPAL_SANDBOX_CLIENT_ID: ${process.env.PAYPAL_SANDBOX_CLIENT_ID ? '✅ Set (' + process.env.PAYPAL_SANDBOX_CLIENT_ID.length + ' chars)' : '❌ Missing (will fallback to production)'}<br>
PAYPAL_SANDBOX_SECRET_KEY: ${process.env.PAYPAL_SANDBOX_SECRET_KEY ? '✅ Set (' + process.env.PAYPAL_SANDBOX_SECRET_KEY.length + ' chars)' : '❌ Missing (will fallback to production)'}<br>
PAYPAL_WEBHOOK_ID: ${process.env.PAYPAL_WEBHOOK_ID ? '✅ Set (' + process.env.PAYPAL_WEBHOOK_ID.length + ' chars)' : '❌ Missing'}
        </div>

        <h2>🧪 Test PayPal Credentials</h2>
        <button class="button" onclick="testCredentials()">Test Credentials</button>
        <div id="testResult"></div>

        <h2>💡 Next Steps</h2>
        <div class="status warning">
            <strong>If credentials are missing:</strong>
            <ol>
                <li>Go to <a href="https://developer.paypal.com/" target="_blank">PayPal Developer Dashboard</a></li>
                <li>Create/get your Client ID and Secret for both sandbox and production</li>
                <li>Add them to your <code>.env.local</code> file:
                <div class="code">
${process.env.NODE_ENV === 'production' ?
  `# Production Credentials (Live Payments)
PAYPAL_CLIENT_ID=your_production_client_id_here
PAYPAL_SECRET_KEY=your_production_secret_key_here` :
  `# Sandbox Credentials (Development/Testing)
PAYPAL_SANDBOX_CLIENT_ID=your_sandbox_client_id_here
PAYPAL_SANDBOX_SECRET_KEY=your_sandbox_secret_key_here

# Production Credentials (for when you deploy)
PAYPAL_CLIENT_ID=your_production_client_id_here
PAYPAL_SECRET_KEY=your_production_secret_key_here`
}
                </div>
                </li>
                <li>Restart your development server</li>
            </ol>
        </div>

        <div class="status info">
            <strong>Production vs Sandbox:</strong><br>
            • Development uses PayPal Sandbox (test payments)<br>
            • Production uses live PayPal payments<br>
            • Make sure your credentials match the environment
        </div>

        <button class="button" onclick="window.location.href='/api/paypal/test-credentials'">📊 View Raw Test Results</button>
    </div>

    <script>
        async function testCredentials() {
            const resultDiv = document.getElementById('testResult');
            resultDiv.innerHTML = '<div class="status info">Testing PayPal credentials...</div>';

            try {
                const response = await fetch('/api/paypal/test-credentials');
                const data = await response.json();

                if (data.status === 'success') {
                    resultDiv.innerHTML = \`
                        <div class="status success">
                            <strong>✅ Success!</strong> PayPal credentials are valid and working.
                            <br>Token test: \${data.tokenTest}
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="status error">
                            <strong>❌ Error:</strong> \${data.message}
                            <br><strong>API Error:</strong> \${JSON.stringify(data.apiError, null, 2)}
                        </div>
                    \`;
                }
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div class="status error">
                        <strong>❌ Network Error:</strong> \${error.message}
                    </div>
                \`;
            }
        }
    </script>
</body>
</html>
  `;

  res.status(200).send(html);
}
