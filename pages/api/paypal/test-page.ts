import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'text/html');

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>PayPal Test - SheetyAI</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status { padding: 15px; margin: 15px 0; border-radius: 6px; border-left: 4px solid; }
        .success { background: #d4edda; color: #155724; border-color: #28a745; }
        .error { background: #f8d7da; color: #721c24; border-color: #dc3545; }
        .warning { background: #fff3cd; color: #856404; border-color: #ffc107; }
        .info { background: #d1ecf1; color: #0c5460; border-color: #17a2b8; }
        .button { background: #0070ba; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px; }
        .button:hover { background: #005ea6; }
        .button:disabled { background: #ccc; cursor: not-allowed; }
        .code { background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: monospace; margin: 15px 0; border: 1px solid #dee2e6; }
        .result { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 PayPal API Test - SheetyAI</h1>
        <p>Test your PayPal integration directly from this page.</p>

        <div class="status info">
            <strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}<br>
            <strong>PayPal URL:</strong> ${process.env.NODE_ENV === 'production' || !process.env.PAYPAL_SANDBOX_CLIENT_ID ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com'}<br>
            <strong>Credentials:</strong> ${process.env.PAYPAL_CLIENT_ID ? '✅ Available' : '❌ Missing'}
        </div>

        <h2>🧪 Test PayPal API Connection</h2>
        <button class="button" id="testBtn" onclick="testPayPalAPI()">Test PayPal API</button>
        <button class="button" onclick="testCredentials()">Test Credentials Only</button>

        <div id="result" class="result" style="display: none;"></div>

        <h2>📋 What This Tests</h2>
        <div class="status info">
            <strong>API Test:</strong> Creates a $1.00 test order to verify:
            <ul>
                <li>✅ PayPal API connectivity</li>
                <li>✅ Authentication works</li>
                <li>✅ Order creation succeeds</li>
                <li>✅ Response parsing works</li>
            </ul>
        </div>

        <div class="status warning">
            <strong>Credentials Test:</strong> Only checks if credentials are loaded (no API call)
        </div>

        <h2>🐛 Troubleshooting</h2>
        <div class="status error">
            <strong>If API test fails:</strong>
            <ol>
                <li>Check browser console for detailed logs</li>
                <li>Verify PayPal credentials in .env.local</li>
                <li>Ensure you're using correct environment (sandbox vs production)</li>
                <li>Check PayPal developer dashboard for any account issues</li>
            </ol>
        </div>

        <div class="status info">
            <strong>Test Results:</strong> Check the browser console (F12) for detailed logs from both frontend and backend API calls.
        </div>
    </div>

    <script>
        async function testPayPalAPI() {
            const btn = document.getElementById('testBtn');
            const resultDiv = document.getElementById('result');

            btn.disabled = true;
            btn.textContent = 'Testing...';
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<div class="status info">Making API call to PayPal...</div>';

            try {
                console.log('🔄 Starting PayPal API test...');

                const response = await fetch('/api/paypal/test-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({})
                });

                const data = await response.json();
                console.log('📋 API Response:', data);

                if (data.success) {
                    resultDiv.innerHTML = \`
                        <div class="status success">
                            <strong>✅ SUCCESS!</strong> PayPal API is working correctly.
                            <br><strong>Order ID:</strong> \${data.orderId}
                            <br><strong>Approval URL:</strong> <a href="\${data.approvalUrl}" target="_blank">\${data.approvalUrl}</a>
                        </div>
                        <div class="code">
<strong>Full Response:</strong><br>
\${JSON.stringify(data, null, 2)}
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="status error">
                            <strong>❌ FAILED:</strong> \${data.error || 'Unknown error'}
                            <br><strong>Details:</strong> \${JSON.stringify(data.details || {})}
                        </div>
                        <div class="code">
<strong>Error Details:</strong><br>
\${JSON.stringify(data, null, 2)}
                        </div>
                    \`;
                }

            } catch (error) {
                console.error('💥 Frontend error:', error);
                resultDiv.innerHTML = \`
                    <div class="status error">
                        <strong>💥 FRONTEND ERROR:</strong> \${error.message}
                        <br>Check browser console for details.
                    </div>
                \`;
            } finally {
                btn.disabled = false;
                btn.textContent = 'Test PayPal API';
            }
        }

        async function testCredentials() {
            const resultDiv = document.getElementById('result');
            resultDiv.style.display = 'block';

            try {
                const response = await fetch('/api/paypal/test-credentials');
                const data = await response.json();
                console.log('📋 Credentials test:', data);

                if (data.status === 'success') {
                    resultDiv.innerHTML = \`
                        <div class="status success">
                            <strong>✅ Credentials Valid!</strong> PayPal authentication is working.
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="status error">
                            <strong>❌ Credentials Issue:</strong> \${data.message}
                        </div>
                    \`;
                }
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div class="status error">
                        <strong>💥 Error:</strong> \${error.message}
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
