import { GoogleGenerativeAI } from '@google/generative-ai';
import { SupabaseClient } from '@supabase/supabase-js';
import EmbeddingService from './embeddingService';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface ChatResponse {
  response: string;
  contextUsed: any[];
  timestamp: Date;
}

class ChatbotService {
  private genAI: GoogleGenerativeAI;
  private supabase: SupabaseClient;
  private embeddingService: EmbeddingService;
  private chatModel: string = 'gemini-2.0-flash-exp';

  constructor(apiKey: string, supabase: SupabaseClient) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.supabase = supabase;
    this.embeddingService = new EmbeddingService(apiKey, supabase);
  }

  /**
   * Get system prompt for the chatbot
   */
  private getSystemPrompt(): string {
    return `You are an AI assistant helping developers understand their time tracking data and work patterns.

Your role:
- Analyze time tracking data from three levels:
  1. Processed Tasks: Individual work tasks with durations and activities
  2. Subtasks: Groups of related tasks (work streams)
  3. Major Tasks: High-level projects containing multiple subtasks
- Provide insights about productivity patterns, time usage, and work habits
- Help identify areas where developers might be struggling or spending too much time
- Give actionable suggestions to improve efficiency
- Be concise, clear, and data-driven in your responses

Guidelines:
- Use the provided context from the user's activity data to answer questions
- If the context doesn't contain relevant information, acknowledge it honestly
- Format your responses in a clear, easy-to-read way with bullet points and sections when appropriate
- Include specific data points (times, durations, app names, task titles) when available
- Focus on insights and patterns rather than just listing raw data
- Be encouraging and constructive in your feedback

Remember: You're helping developers improve their workflow, so be supportive and practical.`;
  }

  /**
   * Format context from embeddings search results
   */
  private formatContext(searchResults: any[]): string {
    if (searchResults.length === 0) {
      return 'No relevant activity data found.';
    }

    let context = 'Relevant activity data:\n\n';

    searchResults.forEach((result, index) => {
      context += `[${index + 1}] ${result.source_type.toUpperCase()}:\n`;
      context += `${result.content}\n`;
      
      if (result.metadata && Object.keys(result.metadata).length > 0) {
        context += `Additional info: ${JSON.stringify(result.metadata, null, 2)}\n`;
      }
      
      context += `Relevance: ${(result.similarity * 100).toFixed(1)}%\n\n`;
    });

    return context;
  }

  /**
   * Get recent chat history for context
   */
  private async getChatHistory(userId: string, limit: number = 5): Promise<ChatMessage[]> {
    try {
      const { data, error } = await this.supabase
        .from('chat_history')
        .select('message, response')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      // Convert to chat messages and reverse to get chronological order
      const messages: ChatMessage[] = [];
      data.reverse().forEach(chat => {
        messages.push(
          { role: 'user', content: chat.message },
          { role: 'model', content: chat.response }
        );
      });

      return messages;
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Save chat interaction to history
   */
  private async saveChatHistory(
    userId: string,
    message: string,
    response: string,
    contextUsed: any[]
  ): Promise<void> {
    try {
      await this.supabase
        .from('chat_history')
        .insert({
          user_id: userId,
          message,
          response,
          context_used: contextUsed,
        });
    } catch (error) {
      console.error('Error saving chat history:', error);
      // Don't throw - we don't want to fail the chat because of history save issues
    }
  }

  /**
   * Chat with the bot using RAG
   */
  async chat(
    message: string,
    userId: string,
    options?: {
      includeHistory?: boolean;
      contextLimit?: number;
      contextThreshold?: number;
    }
  ): Promise<ChatResponse> {
    try {
      // Step 1: Search for relevant context using embeddings
      const searchResults = await this.embeddingService.searchSimilar(
        message,
        userId,
        {
          limit: options?.contextLimit || 10,
          threshold: options?.contextThreshold || 0.6,
        }
      );

      // Step 2: Format the context
      const context = this.formatContext(searchResults);

      // Step 3: Get chat history if requested
      const history = options?.includeHistory !== false 
        ? await this.getChatHistory(userId, 5)
        : [];

      // Step 4: Build the conversation
      const model = this.genAI.getGenerativeModel({ 
        model: this.chatModel,
        systemInstruction: this.getSystemPrompt(),
      });

      // Build message history
      const chatHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      // Start chat with history
      const chat = model.startChat({
        history: chatHistory,
      });

      // Create the prompt with context
      const prompt = `Context from user's activity data:
${context}

User question: ${message}

Please provide a helpful, concise response based on the context above. If the context doesn't contain relevant information, let the user know what kind of data you'd need to answer their question.`;

      // Step 5: Generate response
      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();

      // Step 6: Save to history
      await this.saveChatHistory(userId, message, responseText, searchResults);

      return {
        response: responseText,
        contextUsed: searchResults.map(r => ({
          type: r.source_type,
          id: r.source_id,
          similarity: r.similarity,
        })),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error in chat:', error);
      throw new Error('Failed to generate chat response');
    }
  }

  /**
   * Get a summary of user's activity for a time period
   */
  async getActivitySummary(
    userId: string,
    timeframe: 'today' | 'week' | 'month'
  ): Promise<string> {
    try {
      // Generate a query based on timeframe
      const query = `Show me a summary of all my activities and tasks from ${timeframe}`;
      
      const response = await this.chat(query, userId, {
        includeHistory: false,
        contextLimit: 20,
      });

      return response.response;
    } catch (error) {
      console.error('Error getting activity summary:', error);
      throw error;
    }
  }

  /**
   * Get productivity insights
   */
  async getProductivityInsights(userId: string): Promise<string> {
    try {
      const query = `Analyze my productivity patterns and tell me where I'm spending most of my time. What areas could I improve?`;
      
      const response = await this.chat(query, userId, {
        includeHistory: false,
        contextLimit: 30,
        contextThreshold: 0.5,
      });

      return response.response;
    } catch (error) {
      console.error('Error getting productivity insights:', error);
      throw error;
    }
  }

  /**
   * Get chat history for display
   */
  async getHistory(userId: string, limit: number = 20): Promise<Array<{
    message: string;
    response: string;
    created_at: string;
  }>> {
    try {
      const { data, error } = await this.supabase
        .from('chat_history')
        .select('message, response, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error getting history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getHistory:', error);
      return [];
    }
  }

  /**
   * Clear chat history
   */
  async clearHistory(userId: string): Promise<void> {
    try {
      await this.supabase
        .from('chat_history')
        .delete()
        .eq('user_id', userId);
    } catch (error) {
      console.error('Error clearing history:', error);
      throw new Error('Failed to clear chat history');
    }
  }

  /**
   * Get suggested questions based on user's data
   */
  async getSuggestedQuestions(userId: string): Promise<string[]> {
    try {
      // Get stats about what kind of data the user has
      const stats = await this.embeddingService.getEmbeddingStats(userId);

      const suggestions: string[] = [
        "What did I work on today?",
        "Show me my productivity summary for this week",
      ];

      if (stats.bySourceType['processed_task'] > 0) {
        suggestions.push("What tasks took me the longest?");
        suggestions.push("Show me my completed tasks");
      }

      if (stats.bySourceType['subtask'] > 0) {
        suggestions.push("What subtasks am I spending most time on?");
      }

      if (stats.bySourceType['major_task'] > 0) {
        suggestions.push("What are my main projects?");
        suggestions.push("Show me progress on major tasks");
      }

      if (stats.total > 10) {
        suggestions.push("What patterns do you see in my work habits?");
        suggestions.push("Where could I improve my efficiency?");
      }

      return suggestions;
    } catch (error) {
      console.error('Error getting suggested questions:', error);
      return [
        "What did I work on today?",
        "Show me my productivity summary",
      ];
    }
  }
}

export default ChatbotService; 