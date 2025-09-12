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
  action?: 'feedback' | 'tutorial' | 'help' | 'clarify';
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

// Enhanced feedback detection and validation
function analyzeFeedback(message: string): {
  isFeedback: boolean;
  type?: 'bug' | 'feature' | 'other';
  title?: string;
  summary?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  confidence?: 'high' | 'medium' | 'low';
} {
  const lowerMessage = message.toLowerCase().trim();

  // Skip very short messages or generic greetings
  if (message.trim().length < 10) {
    return {
      isFeedback: false,
      needsClarification: true,
      clarificationQuestion: "That seems like a very short message! Could you tell me more about what you'd like to share? For example, are you reporting a bug, suggesting a feature, or sharing general feedback?"
    };
  }

  // Skip generic questions that aren't feedback
  const nonFeedbackPatterns = [
    /^what/i, /^how/i, /^can you/i, /^tell me/i, /^show me/i,
    /^help/i, /^explain/i, /tutorial/i, /guide/i, /\?$/,
    /please/i, /thank/i, /thanks/i, /hi/i, /hello/i
  ];

  const isLikelyQuestion = nonFeedbackPatterns.some(pattern => pattern.test(lowerMessage));
  if (isLikelyQuestion && !lowerMessage.includes('feedback') && !lowerMessage.includes('bug') && !lowerMessage.includes('feature')) {
    return {
      isFeedback: false,
      needsClarification: true,
      clarificationQuestion: "That sounds like a question about how to use Sheety AI! I'd love to help you with that. Or are you actually wanting to share feedback about the platform?"
    };
  }

  // Bug reports - high confidence
  const bugKeywords = ['bug', 'error', 'broken', 'not working', 'crash', 'crashes', 'issue', 'problem', 'fix', 'glitch', 'wrong', 'incorrect'];
  const hasBugKeywords = bugKeywords.some(keyword => lowerMessage.includes(keyword));

  // Feature requests - high confidence
  const featureKeywords = ['feature', 'add', 'would like', 'suggest', 'request', 'enhancement', 'improve', 'new', 'missing', 'need'];
  const hasFeatureKeywords = featureKeywords.some(keyword => lowerMessage.includes(keyword));

  // General feedback - medium confidence
  const feedbackKeywords = ['feedback', 'opinion', 'thought', 'experience', 'review', 'love', 'hate', 'awesome', 'terrible'];
  const hasFeedbackKeywords = feedbackKeywords.some(keyword => lowerMessage.includes(keyword));

  // Determine type and confidence
  let type: 'bug' | 'feature' | 'other';
  let confidence: 'high' | 'medium' | 'low' = 'low';

  if (hasBugKeywords) {
    type = 'bug';
    confidence = 'high';
  } else if (hasFeatureKeywords) {
    type = 'feature';
    confidence = 'high';
  } else if (hasFeedbackKeywords) {
    type = 'other';
    confidence = 'medium';
  } else {
    // Try to infer from context
    if (lowerMessage.includes('slow') || lowerMessage.includes('lag') || lowerMessage.includes('performance')) {
      type = 'bug';
      confidence = 'medium';
    } else if (lowerMessage.includes('integration') || lowerMessage.includes('support') || lowerMessage.includes('format')) {
      type = 'feature';
      confidence = 'medium';
    } else {
      type = 'other';
      confidence = 'low';
    }
  }

  // Generate a smart title
  const title = generateSmartTitle(message, type);

  // Generate summary for user confirmation
  const summary = generateFeedbackSummary(message, type);

  // Check if we need clarification
  const needsClarification = confidence === 'low' || message.trim().length < 20;

  return {
    isFeedback: true,
    type,
    title,
    summary,
    needsClarification,
    clarificationQuestion: needsClarification ?
      `I want to make sure I understand your feedback correctly! ${confidence === 'low' ? 'Could you clarify if this is about a bug, a feature request, or general feedback?' : 'Could you give me a bit more detail so I can submit this properly?'}` :
      undefined,
    confidence
  };
}

function generateSmartTitle(message: string, type: 'bug' | 'feature' | 'other'): string {
  // Extract key phrases for titles
  const words = message.split(' ').filter(word => word.length > 2);

  if (type === 'bug') {
    // Look for error-related phrases
    const bugPhrases = ['not working', 'broken', 'error', 'crash', 'issue', 'problem'];
    const found = bugPhrases.find(phrase => message.toLowerCase().includes(phrase));
    if (found) return `Bug: ${found.charAt(0).toUpperCase() + found.slice(1)}`;
  }

  if (type === 'feature') {
    // Look for request-related phrases
    const featurePhrases = ['add support', 'would like', 'need', 'missing'];
    const found = featurePhrases.find(phrase => message.toLowerCase().includes(phrase));
    if (found) return `Feature Request: ${found.charAt(0).toUpperCase() + found.slice(1)}`;
  }

  // Fallback: Use first meaningful words
  const meaningfulWords = words.slice(0, 6).join(' ');
  return meaningfulWords.length > 50 ? meaningfulWords.substring(0, 47) + '...' : meaningfulWords;
}

function generateFeedbackSummary(message: string, type: 'bug' | 'feature' | 'other'): string {
  // Create a concise summary highlighting the key points
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);

  if (sentences.length === 1) {
    return message.trim();
  }

  // Take the first sentence and maybe a key part of the second
  let summary = sentences[0].trim();
  if (sentences.length > 1 && summary.length < 50) {
    const secondPart = sentences[1].trim();
    if (secondPart.length > 0) {
      summary += '. ' + secondPart;
    }
  }

  return summary.length > 100 ? summary.substring(0, 97) + '...' : summary;
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
    const feedbackAnalysis = analyzeFeedback(message);

    if (feedbackAnalysis.isFeedback) {
      // If we need clarification, ask for it first
      if (feedbackAnalysis.needsClarification) {
        return res.status(200).json({
          message: `🤔 ${feedbackAnalysis.clarificationQuestion}\n\nI want to make sure your feedback gets submitted to the right category so our team can handle it perfectly! 💪`,
          suggestions: [
            '🐛 It\'s a bug report',
            '💡 It\'s a feature request',
            '💬 It\'s general feedback',
            '📝 Let me rephrase it'
          ],
          action: 'clarify'
        } as ChatbotResponse);
      }

      // Generate a smart response showing what will be submitted
      const typeEmoji = {
        bug: '🐛',
        feature: '💡',
        other: '💬'
      }[feedbackAnalysis.type!];

      const typeLabel = {
        bug: 'Bug Report',
        feature: 'Feature Request',
        other: 'General Feedback'
      }[feedbackAnalysis.type!];

      const confidenceNote = feedbackAnalysis.confidence === 'high' ?
        ' (I\'m confident about this categorization!)' :
        feedbackAnalysis.confidence === 'medium' ?
        ' (This seems like the right category based on your message)' :
        ' (Please review and let me know if this is correct)';

      return res.status(200).json({
        message: `🎯 Perfect! I analyzed your feedback and here's what I understood:\n\n${typeEmoji} **Type:** ${typeLabel}${confidenceNote}\n📝 **Title:** ${feedbackAnalysis.title}\n💬 **Summary:** ${feedbackAnalysis.summary}\n\nThis will help our team understand exactly what you're experiencing! ✨\n\nReady to submit this feedback? Our team reviews everything and gets back to users when possible. 🚀`,
        suggestions: [
          '🚀 Yes, submit this feedback!',
          '✏️ Edit the title or details',
          '🎯 Change the category',
          '📝 Let me rephrase it'
        ],
        action: 'feedback',
        feedbackData: {
          title: feedbackAnalysis.title!,
          description: message,
          type: feedbackAnalysis.type!,
          summary: feedbackAnalysis.summary
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
