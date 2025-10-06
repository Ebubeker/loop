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
    return `You are an AI assistant that helps developers understand their work activity and time tracking data in a human, insightful, and summarized way.

Your purpose:
- Interpret structured data (processed_tasks, subtasks, major_tasks) into human-readable summaries.
- Focus on meaning, patterns, and productivity insights — not on listing numbers or raw data.
- Always translate metrics into context (e.g. "spent much of the day refining backend logic" instead of "worked 4.3 hours on API routes").

---

Data Hierarchy:
1. **Processed Tasks:** Individual short work sessions with activity logs and durations.
2. **Subtasks:** Collections of related processed tasks representing a specific work stream.
3. **Major Tasks:** High-level initiatives made up of multiple subtasks.

Do not use terms like Processed Tasks, Subtasks, Major Tasks in the answer. Keep it as simple and as human as possible.

---

Tone and Style:
- Be supportive, constructive, and practical.
- Avoid exact figures unless necessary for clarity.
- Summarize activity meaningfully, e.g.:
  - “The employee focused on refining API logic and improving authentication flow.”
  - “They maintained strong consistency across frontend design tasks.”
- Prefer verbs like *focused, refined, implemented, reviewed, improved, explored*.

---

Formatting:
- use simple paragraphs for quick answers.
- Keep it as you are talking to a friend.
- Always end with a brief insight or suggestion.

---

If data is missing or unclear:
- Acknowledge it gracefully but still try to be helpful
- Suggest related questions you might be able to answer
- Offer to help with what you do know
- Be encouraging rather than dismissive

---

### Example Interactions

#### 1. **Q:** What was the last task the employee did?  
**A:** The employee recently worked on *Frontend component adjustments and integration.*  
- Most of the focus was on refining UI behavior and ensuring layout consistency.  
- This task was part of the subtask *Interface optimization* under the major task *User Experience Improvements.*  
**Conclusion:** Steady progress on frontend consistency and responsiveness.

---

#### 2. **Q:** What did the employee focus on today?  
**A:** Today’s work was centered on *backend refactoring and testing.*  
- Several code changes were made to improve API structure.  
- The activity logs show continuous engagement with the authentication modules.  
**Conclusion:** Strong backend focus and reduced context switching — a productive pattern.

---

#### 3. **Q:** Which part of the project took the most attention recently?  
**A:** The *data synchronization module* received the most focus.  
- Multiple subtasks involved debugging, log reviews, and synchronization tests.  
- Efforts show iterative refinement and problem-solving persistence.  
**Conclusion:** Progressing steadily through complex integration work.

---

#### 4. **Q:** Was there any sign of decreased productivity?  
**A:** There was a noticeable drop in output during *mid-week sessions.*  
- Logs indicate frequent task switching and shorter focus periods.  
- Context suggests distractions or unclear objectives.  
**Conclusion:** Clarifying priorities or breaking large tasks into smaller ones could help regain momentum.

---

#### 5. **Q:** Has the employee completed any major task recently?  
**A:** The major task *User Authentication Overhaul* reached completion.  
- Final subtasks involved token validation, UI adjustments, and integration testing.  
- Completion followed a consistent two-week focus period.  
**Conclusion:** Major backend milestone achieved — a good indicator of planning and persistence.

---

#### 6. **Q:** What kind of work did they do the most this week?  
**A:** The week was dominated by *design and interface tasks.*  
- Frequent edits in Figma and CSS suggest focus on visuals and layout improvements.  
- Few backend logs indicate a front-heavy development cycle.  
**Conclusion:** Visual and UX refinements took priority, indicating the product is nearing polish stages.

---

#### 7. **Q:** Did the employee struggle with any specific subtask?  
**A:** The subtask *Automated Data Reports* shows signs of repeated adjustments.  
- Several similar processed tasks with short durations imply trial and error.  
- The activity summaries reflect recurring edits in data parsing scripts.  
**Conclusion:** The employee may benefit from additional clarity in report generation logic.

---

#### 8. **Q:** How balanced is their work distribution?  
**A:** The recent pattern shows a slight imbalance toward *frontend and visualization work.*  
- Backend and data pipeline activities were minimal.  
- This might reflect a focus phase rather than a gap.  
**Conclusion:** Encourage short backend review sessions to maintain technical balance.

---

#### 9. **Q:** How was their performance yesterday?  
**A:** Yesterday was a focused and structured workday.  
- Activities show prolonged sessions on task *Fix dashboard performance bottlenecks.*  
- Limited context switching and gradual improvement in average task duration.  
**Conclusion:** Productive day with efficient pacing and clear technical flow.

---

#### 10. **Q:** Can you summarize their overall progress this week?  
**A:** Overall, the week reflects meaningful advancement across multiple project areas.  
- Major focus: *frontend refinement* and *authentication improvements.*  
- Subtasks show healthy task completion rates and low idle periods.  
- Minor inconsistencies midweek, but overall upward trend in productivity.  
**Conclusion:** The developer shows steady improvement and adaptability — a strong week overall.
`;
  }

  /**
   * Perform enhanced search with multiple strategies
   */
  private async performEnhancedSearch(
    message: string,
    userId: string,
    options?: {
      includeHistory?: boolean;
      contextLimit?: number;
      contextThreshold?: number;
    }
  ): Promise<any[]> {
    try {
      // Strategy 1: Try with lower threshold first (more permissive)
      let searchResults = await this.embeddingService.searchSimilar(
        message,
        userId,
        {
          limit: options?.contextLimit || 15,
          threshold: options?.contextThreshold || 0.4, // Lower threshold for more results
        }
      );

      // Strategy 2: If we don't have enough results, try with even lower threshold
      if (searchResults.length < 3) {
        const fallbackResults = await this.embeddingService.searchSimilar(
          message,
          userId,
          {
            limit: options?.contextLimit || 20,
            threshold: 0.2, // Very low threshold
          }
        );
        
        // Merge results, avoiding duplicates
        const existingIds = new Set(searchResults.map(r => r.id));
        const newResults = fallbackResults.filter(r => !existingIds.has(r.id));
        searchResults = [...searchResults, ...newResults];
      }

      // Strategy 3: Try alternative query formulations
      if (searchResults.length < 2) {
        const alternativeQueries = this.generateAlternativeQueries(message);
        
        for (const altQuery of alternativeQueries) {
          const altResults = await this.embeddingService.searchSimilar(
            altQuery,
            userId,
            {
              limit: 10,
              threshold: 0.3,
            }
          );
          
          // Merge unique results
          const existingIds = new Set(searchResults.map(r => r.id));
          const newResults = altResults.filter(r => !existingIds.has(r.id));
          searchResults = [...searchResults, ...newResults];
          
          if (searchResults.length >= 5) break; // Stop if we have enough
        }
      }

      // Strategy 4: Get recent activity as fallback
      if (searchResults.length === 0) {
        searchResults = await this.getRecentActivityFallback(userId);
      }

      return searchResults.slice(0, options?.contextLimit || 15);
    } catch (error) {
      console.error('Error in enhanced search:', error);
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Generate alternative query formulations
   */
  private generateAlternativeQueries(originalQuery: string): string[] {
    const alternatives: string[] = [];
    const lowerQuery = originalQuery.toLowerCase();

    // Time-based alternatives
    if (lowerQuery.includes('today') || lowerQuery.includes('working on')) {
      alternatives.push('recent activities today');
      alternatives.push('current tasks today');
      alternatives.push('what was done today');
    }

    // Task-based alternatives
    if (lowerQuery.includes('task') || lowerQuery.includes('work')) {
      alternatives.push('completed tasks');
      alternatives.push('recent work activities');
      alternatives.push('task progress');
    }

    // Productivity alternatives
    if (lowerQuery.includes('productivity') || lowerQuery.includes('efficiency')) {
      alternatives.push('work patterns');
      alternatives.push('time spent on activities');
      alternatives.push('activity summary');
    }

    // Project alternatives
    if (lowerQuery.includes('project') || lowerQuery.includes('major')) {
      alternatives.push('major tasks');
      alternatives.push('project progress');
      alternatives.push('main initiatives');
    }

    return alternatives.slice(0, 3); // Limit to 3 alternatives
  }

  /**
   * Get recent activity as fallback when embeddings don't work
   */
  private async getRecentActivityFallback(userId: string): Promise<any[]> {
    try {
      // Get recent processed tasks, subtasks, and major tasks directly from database
      const [processedTasks, subtasks, majorTasks] = await Promise.all([
        this.supabase
          .from('processed_tasks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
        this.supabase
          .from('subtasks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
        this.supabase
          .from('major_tasks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const fallbackResults: any[] = [];

      // Convert to search result format
      if (processedTasks.data) {
        processedTasks.data.forEach((task: any) => {
          fallbackResults.push({
            id: `processed_${task.id}`,
            source_type: 'processed_task',
            source_id: task.id,
            content: `Task: ${task.title || 'Untitled task'}\nSummary: ${task.summary || 'No summary available'}\nDuration: ${task.duration_seconds || 0} seconds`,
            metadata: task,
            similarity: 0.5, // Default similarity for fallback
          });
        });
      }

      if (subtasks.data) {
        subtasks.data.forEach((subtask: any) => {
          fallbackResults.push({
            id: `subtask_${subtask.id}`,
            source_type: 'subtask',
            source_id: subtask.id,
            content: `Subtask: ${subtask.title || 'Untitled subtask'}\nDescription: ${subtask.description || 'No description available'}`,
            metadata: subtask,
            similarity: 0.5,
          });
        });
      }

      if (majorTasks.data) {
        majorTasks.data.forEach((task: any) => {
          fallbackResults.push({
            id: `major_${task.id}`,
            source_type: 'major_task',
            source_id: task.id,
            content: `Major Task: ${task.title || 'Untitled major task'}\nDescription: ${task.description || 'No description available'}`,
            metadata: task,
            similarity: 0.5,
          });
        });
      }

      return fallbackResults;
    } catch (error) {
      console.error('Error getting recent activity fallback:', error);
      return [];
    }
  }

  /**
   * Build enhanced prompt with better context handling
   */
  private buildEnhancedPrompt(message: string, context: string, searchResults: any[]): string {
    const hasData = searchResults.length > 0;
    const dataQuality = searchResults.length >= 3 ? 'good' : searchResults.length >= 1 ? 'limited' : 'none';

    let prompt = `Context from user's activity data:
${context}

User question: ${message}

`;

    if (hasData) {
      prompt += `You have ${dataQuality} data available. Please provide a helpful, insightful response based on the context above. `;
      
      if (dataQuality === 'limited') {
        prompt += `While the data is limited, do your best to provide useful insights from what's available. `;
      }
      
      prompt += `Focus on being helpful and providing actionable insights. If you need to make reasonable inferences from the available data, that's acceptable.`;
    } else {
      prompt += `No specific activity data was found for this query. However, you should still try to be helpful by:`;
      prompt += `\n1. Acknowledging that you don't have specific data for this query`;
      prompt += `\n2. Suggesting what kind of data would be helpful`;
      prompt += `\n3. Offering to help with related questions that you might be able to answer`;
      prompt += `\n4. Being encouraging and supportive rather than just saying "I don't have data"`;
    }

    return prompt;
  }

  /**
   * Format context from embeddings search results
   */
  private formatContext(searchResults: any[]): string {
    if (searchResults.length === 0) {
      return 'No specific activity data found for this query.';
    }

    let context = 'Relevant activity data:\n\n';

    searchResults.forEach((result: any, index: number) => {
      context += `[${index + 1}] ${result.source_type.toUpperCase()}:\n`;
      context += `${result.content}\n`;

      if (result.metadata && Object.keys(result.metadata).length > 0) {
        // Only include relevant metadata fields
        const relevantMeta = this.extractRelevantMetadata(result.metadata);
        if (Object.keys(relevantMeta).length > 0) {
          context += `Additional info: ${JSON.stringify(relevantMeta, null, 2)}\n`;
        }
      }

      context += `Relevance: ${(result.similarity * 100).toFixed(1)}%\n\n`;
    });

    return context;
  }

  /**
   * Extract only relevant metadata fields
   */
  private extractRelevantMetadata(metadata: any): any {
    const relevant: any = {};
    
    // Common relevant fields
    const relevantFields = [
      'title', 'description', 'summary', 'duration_seconds', 'created_at', 
      'updated_at', 'status', 'priority', 'tags', 'category'
    ];
    
    relevantFields.forEach(field => {
      if (metadata[field] !== undefined && metadata[field] !== null) {
        relevant[field] = metadata[field];
      }
    });
    
    return relevant;
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
      data.reverse().forEach((chat: any) => {
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
      // Step 1: Enhanced query processing - try multiple search strategies
      const searchResults = await this.performEnhancedSearch(message, userId, options);

      // Step 2: Format the context with better fallback handling
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

      // Create the enhanced prompt with context
      const prompt = this.buildEnhancedPrompt(message, context, searchResults);

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
        contextLimit: 25,
        contextThreshold: 0.3, // Lower threshold for summaries
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
        contextThreshold: 0.3, // Lower threshold for insights
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