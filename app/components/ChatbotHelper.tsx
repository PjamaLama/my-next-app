"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  action?: 'feedback' | 'tutorial' | 'help';
  feedbackData?: {
    title: string;
    description: string;
    type: 'bug' | 'feature' | 'other';
  };
}

export default function ChatbotHelper() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: "🎉 Hey there! I'm your friendly Sheety AI assistant! 🤖\n\nI know EVERYTHING about this amazing platform and I'm here to help you succeed! Here's what I can do:\n\n🎯 **Guide you through features**\n📊 **Help with Google Sheets setup**\n📎 **Show you how to upload files**\n🐛 **Help report bugs or request features**\n💡 **Give you pro tips and tricks**\n\nWhat would you like to explore today? 🚀",
        timestamp: new Date(),
        suggestions: [
          '🎯 What amazing things can Sheety AI do?',
          '📎 How do I upload and analyze files?',
          '📊 How do I connect my Google Sheets?',
          '💬 I want to share feedback or ideas!'
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chatbot-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          conversationHistory: messages.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        suggestions: data.suggestions,
        action: data.action,
        feedbackData: data.feedbackData
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or submit feedback if this persists.',
        timestamp: new Date(),
        suggestions: ['💬 Submit feedback about this issue', '❓ Ask me something else']
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleFeedbackSubmit = async (feedbackData: any) => {
    setIsSubmittingFeedback(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: feedbackData.title,
          description: feedbackData.description,
          type: feedbackData.type,
          user: null // Will be filled by server from auth
        })
      });

      if (response.ok) {
        const successMessage: Message = {
          id: `success-${Date.now()}`,
          role: 'assistant',
          content: '🎉 Boom! Your feedback has been submitted successfully! 🚀\n\nThank you SO much for helping us make Sheety AI even better! Your input means the world to us. 🌟\n\nOur team will review it right away and get back to you if needed. Keep the awesome ideas coming! 💡',
          timestamp: new Date(),
          suggestions: ['🎯 Tell me about another feature', '📖 Show me a tutorial', '🚀 What else can Sheety AI do?']
        };
        setMessages(prev => [...prev, successMessage]);
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      const errorMessage: Message = {
        id: `feedback-error-${Date.now()}`,
        role: 'assistant',
        content: '😅 Oops! Something went wrong while submitting your feedback. No worries though!\n\nTry using the feedback button in the sidebar - it\'s just as awesome and will definitely get your thoughts to our team! 💪\n\nThanks for wanting to help improve Sheety AI! 🙏',
        timestamp: new Date(),
        suggestions: ['📖 Show me how to use the sidebar feedback', '🎯 Tell me about other features', '💬 Let\'s try something else!']
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-16 right-4 z-50 md:bottom-6 md:right-6 w-10 h-10 md:w-14 md:h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        aria-label="Open AI Assistant"
      >
        <Bot className="w-4 h-4 md:w-6 md:h-6 group-hover:scale-110 transition-transform duration-200" />
      </button>

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg h-[600px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Sheety AI Assistant</h3>
                  <p className="text-xs text-white/60">Here to help</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <div className="w-6 h-6 bg-emerald-600/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3 h-3 text-emerald-400" />
                    </div>
                  )}
                  <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white/10 text-white'
                    }`}>
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    </div>

                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="block w-full text-left px-3 py-2 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors"
                            disabled={isTyping}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Feedback Action */}
                    {message.action === 'feedback' && message.feedbackData && (
                      <div className="mt-3">
                        <button
                          onClick={() => handleFeedbackSubmit(message.feedbackData)}
                          disabled={isSubmittingFeedback}
                          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          {isSubmittingFeedback ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              Submit This Feedback
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-3 h-3 text-white/70" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="w-6 h-6 bg-emerald-600/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="bg-white/10 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-xs text-white/60 ml-2">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about Sheety AI..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  disabled={isTyping}
                />
                <button
                  onClick={() => sendMessage(inputValue)}
                  disabled={!inputValue.trim() || isTyping}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-xl transition-colors flex items-center justify-center disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  {isTyping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
