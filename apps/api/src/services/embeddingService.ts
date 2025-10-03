import { GoogleGenerativeAI } from '@google/generative-ai';
import { SupabaseClient } from '@supabase/supabase-js';

interface EmbeddingData {
  userId: string;
  sourceType: 'processed_task' | 'subtask' | 'major_task';
  sourceId: string;
  content: string;
  metadata?: Record<string, any>;
}

interface SearchResult {
  id: string;
  source_type: string;
  source_id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private supabase: SupabaseClient;
  private embeddingModel: string = 'text-embedding-004';

  constructor(apiKey: string, supabase: SupabaseClient) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    this.supabase = supabase;
  }

  /**
   * Generate embedding for a piece of text using Gemini
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
    const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Store an embedding in the database
   */
  async storeEmbedding(data: EmbeddingData): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(data.content);

      const { error } = await this.supabase
        .from('activity_embeddings')
        .insert({
          user_id: data.userId,
          source_type: data.sourceType,
          source_id: data.sourceId,
          content: data.content,
          metadata: data.metadata || {},
          embedding: JSON.stringify(embedding), // Supabase expects string representation
        });

      if (error) {
        console.error('Error storing embedding:', error);
        throw new Error('Failed to store embedding');
      }
    } catch (error) {
      console.error('Error in storeEmbedding:', error);
      throw error;
    }
  }

  /**
   * Search for similar activities using vector similarity
   */
  async searchSimilar(
    query: string,
    userId: string,
    options?: {
      limit?: number;
      threshold?: number;
      sourceTypes?: string[];
    }
  ): Promise<SearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Call the PostgreSQL function for similarity search
      const { data, error } = await this.supabase.rpc('search_similar_activities', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: userId,
        match_count: options?.limit || 10,
        similarity_threshold: options?.threshold || 0.7,
      });

      if (error) {
        console.error('Error searching embeddings:', error);
        throw new Error('Failed to search embeddings');
      }

      // Filter by source types if specified
      let results = data || [];
      if (options?.sourceTypes && options.sourceTypes.length > 0) {
        results = results.filter((r: SearchResult) => 
          options.sourceTypes!.includes(r.source_type)
        );
      }

      return results;
    } catch (error) {
      console.error('Error in searchSimilar:', error);
      throw error;
    }
  }

  /**
   * Batch process and store embeddings for multiple items
   */
  async batchStoreEmbeddings(items: EmbeddingData[]): Promise<void> {
    try {
      // Process in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(item => this.storeEmbedding(item)));
        
        // Small delay between batches to respect rate limits
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Error in batchStoreEmbeddings:', error);
      throw error;
    }
  }

  /**
   * Delete embeddings for a specific source
   */
  async deleteEmbeddings(userId: string, sourceType: string, sourceId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('activity_embeddings')
        .delete()
        .eq('user_id', userId)
        .eq('source_type', sourceType)
        .eq('source_id', sourceId);

      if (error) {
        console.error('Error deleting embeddings:', error);
        throw new Error('Failed to delete embeddings');
      }
    } catch (error) {
      console.error('Error in deleteEmbeddings:', error);
      throw error;
    }
  }

  /**
   * Update embedding when content changes
   */
  async updateEmbedding(data: EmbeddingData): Promise<void> {
    try {
      // Delete old embedding
      await this.deleteEmbeddings(data.userId, data.sourceType, data.sourceId);
      
      // Store new embedding
      await this.storeEmbedding(data);
    } catch (error) {
      console.error('Error in updateEmbedding:', error);
      throw error;
    }
  }

  /**
   * Get embedding statistics for a user
   */
  async getEmbeddingStats(userId: string): Promise<{
    total: number;
    bySourceType: Record<string, number>;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('activity_embeddings')
        .select('source_type')
        .eq('user_id', userId);

      if (error) {
        console.error('Error getting embedding stats:', error);
        throw new Error('Failed to get embedding stats');
      }

      const bySourceType: Record<string, number> = {};
      data.forEach((item: any) => {
        bySourceType[item.source_type] = (bySourceType[item.source_type] || 0) + 1;
      });

      return {
        total: data.length,
        bySourceType,
      };
    } catch (error) {
      console.error('Error in getEmbeddingStats:', error);
      throw error;
    }
  }
} 

export default EmbeddingService; 