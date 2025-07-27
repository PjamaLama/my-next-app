'use client';

import { useState } from 'react';
import { 
  helloFlow, 
  testGenkitIntegration, 
  updateSingleSheetFlow, 
  convertToGenkitFormat,
  type SheetData 
} from '../../lib/genkit-template';

export default function GenkitTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const clearResults = () => {
    setResults([]);
    setError(null);
  };

  const testHelloFlow = async () => {
    setIsLoading(true);
    setError(null);
    try {
      addResult('Testing hello flow...');
      const result = await helloFlow('Test User');
      addResult(`Hello flow result: ${result}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addResult(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testFullIntegration = async () => {
    setIsLoading(true);
    setError(null);
    try {
      addResult('Running full Genkit integration test...');
      await testGenkitIntegration();
      addResult('Full integration test completed successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addResult(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testSheetUpdate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      addResult('Testing sheet update flow...');
      
      // Create sample sheet data
      const sampleSheetData = [
        ['Date', 'Category', 'Amount', 'Description'],
        ['2024-01-01', 'Food', '25.50', 'Lunch'],
        ['2024-01-02', 'Transport', '15.00', 'Fuel'],
        ['2024-01-03', 'Food', '30.00', 'Dinner']
      ];
      
      const genkitSheetData = convertToGenkitFormat(sampleSheetData, 'Test Expenses');
      
      const result = await updateSingleSheetFlow({
        transcript: 'Add a coffee expense of $5.50 for today',
        sheetData: genkitSheetData
      });
      
      addResult(`Sheet update result: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addResult(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testMultipleFlows = async () => {
    setIsLoading(true);
    setError(null);
    try {
      addResult('Testing multiple flows to generate telemetry data...');
      
      // Test 1: Hello flow
      const helloResult = await helloFlow('Telemetry Test');
      addResult(`Hello flow: ${helloResult}`);
      
      // Test 2: Sheet analysis
      const sampleData: SheetData = {
        headers: ['Date', 'Category', 'Amount'],
        rows: [
          ['2024-01-01', 'Food', '25.50'],
          ['2024-01-02', 'Transport', '15.00'],
          ['2024-01-03', 'Food', '30.00']
        ],
        sheetName: 'Telemetry Test Sheet'
      };
      
      // Test 3: Sheet update
      const updateResult = await updateSingleSheetFlow({
        transcript: 'Add a test expense of $10.00 for coffee',
        sheetData: sampleData
      });
      
      addResult(`Update flow: ${JSON.stringify(updateResult, null, 2)}`);
      
      addResult('Multiple flows test completed! Check Firebase console for telemetry data.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addResult(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Genkit Firebase Telemetry Test</h2>
      
      <div className="mb-6">
        <p className="text-gray-600 mb-4">
          Use these tests to trigger Genkit flows and generate telemetry data for Firebase monitoring.
          After running tests, check your Firebase console for metrics (may take up to 5 minutes to appear).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          onClick={testHelloFlow}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Test Hello Flow
        </button>
        
        <button
          onClick={testSheetUpdate}
          disabled={isLoading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Test Sheet Update
        </button>
        
        <button
          onClick={testFullIntegration}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Full Integration Test
        </button>
        
        <button
          onClick={testMultipleFlows}
          disabled={isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Multiple Flows Test
        </button>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-700">Test Results</h3>
        <button
          onClick={clearResults}
          className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
        >
          Clear Results
        </button>
      </div>

      {isLoading && (
        <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded">
          ⏳ Running test... Please wait.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          ❌ Error: {error}
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-gray-500 italic">No test results yet. Run a test to see results here.</p>
        ) : (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div key={index} className="text-sm font-mono bg-white p-2 rounded border">
                {result}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-semibold text-yellow-800 mb-2">📊 Firebase Telemetry Instructions:</h4>
        <ol className="text-sm text-yellow-700 space-y-1">
          <li>1. Run one or more tests above to generate telemetry data</li>
          <li>2. Wait up to 5 minutes for data to appear in Firebase console</li>
          <li>3. Check your Firebase project dashboard for Genkit metrics</li>
          <li>4. Look for metrics like flow executions, response times, and error rates</li>
        </ol>
      </div>
    </div>
  );
} 