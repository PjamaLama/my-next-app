// Shared mocks
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));

import { processMessage } from '../lib/chat/processMessage';
import type { Context, ConversationHistoryItem } from '../lib/chat/types';

describe('processMessage high-level behavior', () => {
  // Increase timeout to accommodate retry backoffs in hydration and tool execution during tests
  beforeAll(() => {
    jest.setTimeout(30000);
  });
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  // Add any high-level integration tests here if needed.
  // For now, this file will primarily serve as a placeholder for overall processMessage flow tests.
});