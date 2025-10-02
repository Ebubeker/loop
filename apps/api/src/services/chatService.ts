import { supabase } from './database';
import { EmbeddingService } from './embeddingService';

export class ChatService {
  /**
   * Answer a question using RAG (Retrieval-Augmented Generation)
   */
  static async askQuestion(
    question: string,
    userId: string,
    options: {
      limit?: number;
      similarityThreshold?: number;
      includeHistory?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    response?: string;
    context?: any[];
    error?: string;
  }> {
    try {
      const limit = options.limit || 10;
      const similarityThreshold = options.similarityThreshold || 0.5;

      console.log(`💬 User question: "${question}"`);

      // Step 1: Retrieve relevant activity logs using embeddings
      const relevantActivities = await EmbeddingService.searchRelevantActivities(
        question,
        userId,
        limit,
        similarityThreshold
      );

      if (relevantActivities.length === 0) {
        return {
          success: false,
          error: 'No relevant activity logs found for your question. Please try rephrasing or ensure you have activity data.'
        };
      }

      console.log(`📊 Found ${relevantActivities.length} relevant activities (similarity > ${similarityThreshold})`);

      // Step 2: Prepare context from retrieved activities
      const contextDocs = relevantActivities.map((activity, idx) => ({
        id: `${activity.source_type}_${activity.source_id}`,
        source_type: activity.source_type,
        source_id: activity.source_id,
        content: activity.content,
        similarity: activity.similarity,
        rank: idx + 1
      }));

      const contextText = relevantActivities
        .map((activity, idx) => `[${idx + 1}] (${activity.source_type}, similarity: ${activity.similarity.toFixed(2)})\n${activity.content}`)
        .join('\n\n---\n\n');

      // Step 3: Get recent chat history if requested
      let conversationHistory = '';
      if (options.includeHistory) {
        const { data: recentChats } = await supabase
          .from('chat_history')
          .select('question, response')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(3);

        if (recentChats && recentChats.length > 0) {
          conversationHistory = '\n\nRecent conversation:\n' + recentChats.reverse().map(
            chat => `Q: ${chat.question}\nA: ${chat.response}`
          ).join('\n\n');
        }
      }

      // Step 4: Create prompt for Gemini
      const prompt = `
You are an AI assistant that helps analyze and answer questions about a user's work activity logs.

You have access to the following relevant activity data from the user's logs:

${contextText}

${conversationHistory}

User's question: ${question}

Instructions:
1. Answer the question based ONLY on the provided activity logs above
2. Be specific and cite which activities you're referencing (use the [number] markers)
3. If the logs don't contain enough information to answer, say so clearly
4. Be conversational and helpful
5. Include relevant details like timestamps, durations, and apps/tasks mentioned
6. If asked about time or duration, calculate totals accurately
7. If asked about productivity or patterns, provide insights based on the data

Provide a clear, helpful response:`.trim();

      // Step 5: Call Gemini AI
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const answerText = response.text();

      console.log(`✅ Generated response (${answerText.length} chars)`);

      // Step 6: Save to chat history
      await supabase
        .from('chat_history')
        .insert({
          user_id: userId,
          question: question,
          response: answerText,
          context_sources: contextDocs,
          model_used: 'gemini-2.5-flash',
          created_at: new Date().toISOString()
        });

      return {
        success: true,
        response: answerText,
        context: contextDocs
      };

    } catch (error: any) {
      console.error('❌ Error in askQuestion:', error);
      return {
        success: false,
        error: error.message || 'Failed to process question'
      };
    }
  }

  /**
   * Get chat history for a user
   */
  static async getChatHistory(
    userId: string,
    limit: number = 20
  ): Promise<Array<{
    id: number;
    question: string;
    response: string;
    context_sources: any[];
    created_at: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching chat history:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('Error in getChatHistory:', error);
      return [];
    }
  }

  /**
   * Clear chat history for a user
   */
  static async clearChatHistory(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_history')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error clearing chat history:', error);
        return false;
      }

      console.log(`✅ Cleared chat history for user ${userId}`);
      return true;

    } catch (error) {
      console.error('Error in clearChatHistory:', error);
      return false;
    }
  }

  /**
   * Get suggested questions based on user's activity data
   */
  static async getSuggestedQuestions(userId: string): Promise<string[]> {
    // Check what type of data the user has
    const { data: tasks } = await supabase
      .from('processed_tasks')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const { data: subtasks } = await supabase
      .from('subtasks')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const { data: majorTasks } = await supabase
      .from('major_tasks')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const suggestions = [];

    if (tasks && tasks.length > 0) {
      suggestions.push(
        'What did I work on today?',
        'How much time did I spend on coding tasks?',
        'What were my most productive hours today?'
      );
    }

    if (subtasks && subtasks.length > 0) {
      suggestions.push(
        'What are my main work streams this week?',
        'Which subtask took the most time?'
      );
    }

    if (majorTasks && majorTasks.length > 0) {
      suggestions.push(
        'Summarize my major projects',
        'What progress have I made on my main initiatives?'
      );
    }

    if (suggestions.length === 0) {
      suggestions.push(
        'What activities have I tracked?',
        'Show me my work summary'
      );
    }

    return suggestions;
  }
} 