# Test Suite Documentation

This directory contains integration tests for the Google Sheets AI update system.

## Test Files

### `updateSheet.integration.test.ts`

This is the main integration test file that tests the `/api/updateSheet` endpoint. It includes:

#### Test Coverage:

1. **API Endpoint Testing**:
   - ✅ Process transcript and return actions for preview
   - ✅ Execute actions when commit flag is true
   - ✅ Handle missing required fields
   - ✅ Handle invalid HTTP method
   - ✅ Handle flow execution errors
   - ✅ Verify tool invocations with correct parameters

2. **Transcript Cleaning**:
   - ✅ Clean transcript before processing (removes filler words, fixes grammar)

#### Test Scenarios:

- **Mock Voice Transcript**: Uses realistic voice transcript examples like "Add fuel expense of 60 dollars for today"
- **Firestore Seeding**: Mocks sample sheet data with headers, data rows, and summary rows
- **Tool Verification**: Verifies that `insertRow` and `updateCell` tools are invoked with correct parameters
- **Error Handling**: Tests various error scenarios and edge cases

#### Sample Test Data:

```typescript
const sampleSheetData = [
  { rowIndex: 1, Date: '2024-01-01', Category: 'Fuel', Amount: '50', isSummary: false },
  { rowIndex: 2, Date: '2024-01-02', Category: 'Food', Amount: '25', isSummary: false },
  { rowIndex: 3, Date: '2024-01-03', Category: 'Total', Amount: '75', isSummary: true },
];
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- __tests__/updateSheet.integration.test.ts

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Configuration

- **Jest Configuration**: `jest.config.js`
- **Test Setup**: `jest.setup.js`
- **Environment**: Node.js (not browser)
- **Mocking**: Comprehensive mocking of Firebase, Google Sheets API, and Genkit

## Key Features Tested

1. **Transcript Processing**: Voice-to-text cleanup and grammar fixing
2. **AI Flow Integration**: Genkit flow execution with proper parameters
3. **Google Sheets Operations**: Row insertion and cell updates
4. **Summary Row Protection**: Validation that prevents inserting into summary rows
5. **Error Handling**: Graceful handling of API errors and validation failures
6. **Two-Phase Process**: Preview mode vs commit mode functionality

## Mock Strategy

- **Firebase Firestore**: Mocked with sample data and collection operations
- **Google Sheets API**: Mocked with successful responses
- **Genkit Flow**: Mocked to return expected action arrays
- **Environment Variables**: Mocked for testing environment

## Test Results

All tests should pass with the following output:

```
 PASS  __tests__/updateSheet.integration.test.ts
  updateSheet API Integration Test
    POST /api/updateSheet
      √ should process transcript and return actions for preview
      √ should execute actions when commit flag is true
      √ should handle missing required fields
      √ should handle invalid HTTP method
      √ should handle flow execution errors
      √ should verify tool invocations with correct parameters
    Transcript Cleaning
      √ should clean transcript before processing

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
``` 