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
      // Handle feedback submission with fun, structured response
      const prompt = `
You are an awesome Sheety AI assistant! The user wants to submit feedback. 🎉

User's message: "${message}"
This appears to be a ${feedbackIntent.type} report.

🎯 YOUR MISSION: Help them submit feedback in the most friendly way possible!

📝 RESPONSE STYLE:
- Start with enthusiasm and emojis! 🎊
- Explain you'll help create a proper feedback submission
- Show them exactly what you'll submit
- Make them feel heard and appreciated
- End with the submission offer

💡 EXAMPLE RESPONSE:
"Hey there! 👋 I totally get what you're saying about ${feedbackIntent.type === 'bug' ? 'that bug' : feedbackIntent.type === 'feature' ? 'that awesome feature idea' : 'your feedback'}!

I can help you submit this properly so our team sees it right away. Here's what I'll create:

📝 **Title:** ${feedbackIntent.title}
🎯 **Type:** ${feedbackIntent.type}
💬 **Description:** ${message}

Ready to submit this feedback? I'll handle everything! 🚀"

Keep it friendly, structured, and encouraging! Make them excited about helping improve Sheety AI! ✨
      `;

      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();

      return res.status(200).json({
        message: aiResponse,
        suggestions: [
          '🚀 Yes, submit this feedback!',
          '✨ Tell me more about this issue',
          '🎯 Show me how to use related features'
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
You are a super friendly and knowledgeable assistant for Sheety AI! 🎉 You know EVERYTHING about this amazing Google Sheets automation platform.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

USER QUESTION: "${message}"${conversationContext}

🎯 MISSION: Help users succeed with Sheety AI by giving clear, actionable instructions with fun emojis!

📝 RESPONSE STYLE:
- Start with a friendly greeting or relevant emoji
- Break down instructions into simple, numbered steps when explaining how-tos
- Use fun, relevant emojis throughout (📊 for sheets, 🎯 for tips, ⚡ for features)
- Keep it conversational but structured
- End with helpful suggestions or next steps
- Under 300 words, but make every word count!

🎪 FORMATTING EXAMPLES:
• "Here's how to connect your sheet: 📊
   1. Click the sheet selector at the bottom
   2. Choose your Google Sheet from the list
   3. Select the right tab - done! ✅"

• "Pro tip: Convert your sheet to a table first! 🎯
   Right-click → Convert to table → Boom! Better AI results ⚡"

• "Need help with files? Here's the magic: 📎
   - Drag & drop PDFs, images, or CSVs
   - AI analyzes them automatically 🤖
   - Get instant insights! 💡"

🔥 ALWAYS INCLUDE:
- Clear step-by-step instructions for how-tos
- Helpful tips with emojis
- Encouraging, friendly tone
- Next steps or related features to explore

Respond as the coolest, most helpful Sheety AI assistant ever! 🚀
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
        '🎓 Show me a quick tutorial',
        '🚀 What amazing things can Sheety AI do?',
        '💬 Share feedback or report something'
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
