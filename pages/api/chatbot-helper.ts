import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

interface ChatbotResponse {
  message: string;
  suggestions?: string[];
  action?: 'feedback' | 'tutorial' | 'help';
  feedbackData?: {
    title: string;
    description: string;
    type: 'bug' | 'feature' | 'other';
  };
}

// Knowledge base about Sheety AI
const KNOWLEDGE_BASE = `
Sheety AI is an AI-powered Google Sheets automation platform that allows users to:

CORE FEATURES:
- AI-powered document analysis and data extraction from PDFs, images, CSVs, and spreadsheets
- Google Sheets integration for automated data management
- Voice recording and transcription capabilities
- Real-time data synchronization
- Centralized ingestion pipeline with deduplication and idempotency
- PWA support for mobile devices
- Chat-driven updates using natural language

HOW TO USE:
- Connect your Google Sheets by selecting spreadsheets and sheets
- Upload files (PDFs, images, CSVs, Excel files) for AI analysis
- Chat with the AI to analyze data, extract information, and update sheets
- Use voice input for hands-free operation
- Review and approve AI-suggested changes before applying them

FILE SUPPORT:
- Images (PNG, JPG, WebP) - AI vision analysis
- PDFs - Text extraction and analysis
- CSVs - Structured data processing
- Excel files (XLSX, XLS) - Spreadsheet analysis

DATA OPERATIONS:
- Add new rows to sheets
- Update existing rows
- Extract structured data from unstructured documents
- Perform data analysis and insights
- Handle duplicates and data validation

PRICING:
- Free tier: Limited messages per day
- Pro tier: Unlimited messages and premium features

TECHNICAL DETAILS:
- Built with Next.js 14 and App Router
- Uses Google Gemini AI for processing
- Firebase for authentication and storage
- Firestore for data persistence
- Google Sheets API for spreadsheet operations
- N8N for workflow automation

COMMON ISSUES:
- Sheet must be converted to a table format for best AI processing
- Empty columns/rows should be removed before uploading
- Use clear, descriptive column headers
- Ensure consistent date formats
- Large files (>10MB) may need compression

FEEDBACK SYSTEM:
- Users can submit bugs, feature requests, and general feedback
- Supports attachments (screenshots, etc.)
- Feedback is categorized and tracked
- Duplicate detection prevents spam
`;

// Helper function to detect feedback intent
function detectFeedbackIntent(message: string): { isFeedback: boolean; type?: 'bug' | 'feature' | 'other'; title?: string } {
  const lowerMessage = message.toLowerCase();

  // Bug reports
  if (lowerMessage.includes('bug') || lowerMessage.includes('error') || lowerMessage.includes('broken') ||
      lowerMessage.includes('not working') || lowerMessage.includes('crash') || lowerMessage.includes('issue') ||
      lowerMessage.includes('problem') || lowerMessage.includes('fix')) {
    return {
      isFeedback: true,
      type: 'bug',
      title: message.length > 50 ? message.substring(0, 47) + '...' : message
    };
  }

  // Feature requests
  if (lowerMessage.includes('feature') || lowerMessage.includes('add') || lowerMessage.includes('would like') ||
      lowerMessage.includes('suggest') || lowerMessage.includes('request') || lowerMessage.includes('enhancement') ||
      lowerMessage.includes('improve') || lowerMessage.includes('new')) {
    return {
      isFeedback: true,
      type: 'feature',
      title: message.length > 50 ? message.substring(0, 47) + '...' : message
    };
  }

  // General feedback
  if (lowerMessage.includes('feedback') || lowerMessage.includes('opinion') || lowerMessage.includes('thought') ||
      lowerMessage.includes('experience') || lowerMessage.includes('review')) {
    return {
      isFeedback: true,
      type: 'other',
      title: message.length > 50 ? message.substring(0, 47) + '...' : message
    };
  }

  return { isFeedback: false };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if API key is available
    if (!process.env.GOOGLE_GENAI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key not configured',
        details: 'Please ensure GOOGLE_GENAI_API_KEY is set in your environment variables'
      });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Check if this is feedback-related
    const feedbackIntent = detectFeedbackIntent(message);

    if (feedbackIntent.isFeedback) {
      // Handle feedback submission
      const prompt = `
You are a helpful assistant for Sheety AI. The user wants to submit feedback.

User's message: "${message}"

Based on the message, this appears to be a ${feedbackIntent.type} report.

Please respond helpfully and offer to help them submit this feedback through our feedback system.
Explain that you'll help them create a proper feedback submission with a clear title and description.

Keep your response concise and helpful.
      `;

      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();

      return res.status(200).json({
        message: aiResponse,
        suggestions: [
          '📝 Help me submit this feedback',
          '📖 Show me how to use this feature',
          '❓ Ask me something else'
        ],
        action: 'feedback',
        feedbackData: {
          title: feedbackIntent.title,
          description: message,
          type: feedbackIntent.type
        }
      } as ChatbotResponse);
    }

    // Regular knowledge base query
    const conversationContext = conversationHistory.length > 0
      ? `\n\nRecent conversation:\n${conversationHistory.slice(-3).map((msg: any) => `${msg.role}: ${msg.content}`).join('\n')}`
      : '';

    const prompt = `
You are a knowledgeable and friendly assistant for Sheety AI, an AI-powered Google Sheets automation platform.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

USER QUESTION: "${message}"${conversationContext}

Instructions:
- Be helpful, friendly, and concise
- Focus on Sheety AI features and capabilities
- If the question is about something outside Sheety AI's scope, politely redirect to relevant topics
- If you don't know something specific, suggest they check our documentation or submit feedback
- Use emojis sparingly and appropriately
- Keep responses under 300 words
- If they need help with feedback/bugs/features, offer to help them submit it

Respond naturally as a helpful assistant who knows everything about Sheety AI.
    `;

    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();

    // Generate contextual suggestions based on the response
    let suggestions: string[] = [];
    const responseLower = aiResponse.toLowerCase();

    if (responseLower.includes('upload') || responseLower.includes('file')) {
      suggestions.push('📎 How do I upload files?');
    }
    if (responseLower.includes('sheet') || responseLower.includes('google')) {
      suggestions.push('📊 How do I connect my Google Sheet?');
    }
    if (responseLower.includes('voice') || responseLower.includes('speak')) {
      suggestions.push('🎤 How does voice input work?');
    }
    if (responseLower.includes('feedback') || responseLower.includes('bug') || responseLower.includes('feature')) {
      suggestions.push('💬 I want to submit feedback');
    }
    if (responseLower.includes('pricing') || responseLower.includes('pro') || responseLower.includes('free')) {
      suggestions.push('💰 Tell me about pricing plans');
    }

    // Default suggestions if none were generated
    if (suggestions.length === 0) {
      suggestions = [
        '📖 Show me the tutorial',
        '💡 What can Sheety AI do?',
        '💬 Submit feedback or report a bug'
      ];
    }

    return res.status(200).json({
      message: aiResponse,
      suggestions: suggestions.slice(0, 3) // Limit to 3 suggestions
    } as ChatbotResponse);

  } catch (error) {
    console.error('Chatbot API error:', error);
    return res.status(500).json({
      error: 'Failed to process chatbot request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
