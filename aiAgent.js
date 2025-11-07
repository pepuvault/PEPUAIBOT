const { OpenAI } = require('openai');
const DataProcessor = require('./dataProcessor');
const fs = require('fs').promises;
const path = require('path');

class AIAgent {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY in .env file');
    }
    this.openai = new OpenAI({ apiKey });
    this.dataProcessor = new DataProcessor();
    this.dataDir = path.join(__dirname, 'data');
  }

  async loadKnowledgeBase() {
    const processedData = await this.dataProcessor.loadProcessedData();
    
    if (processedData.length === 0) {
      throw new Error('No processed data found. Please run scraper and processor first.');
    }

    // Create a knowledge base string from all chunks
    let knowledgeBase = 'KNOWLEDGE BASE:\n\n';
    
    for (const chunk of processedData) {
      knowledgeBase += `[Source: ${chunk.url}]\n`;
      knowledgeBase += `${chunk.content}\n\n`;
      knowledgeBase += '---\n\n';
    }

    return knowledgeBase;
  }

  async createContextualPrompt(userQuery, knowledgeBase) {
    return `You are an AI assistant specialized in answering questions about Pepe Unchained.

${knowledgeBase}

Based on the knowledge base above, answer the following question. If the information is not in the knowledge base, say so clearly.

Question: ${userQuery}

Answer:`;
  }

  async query(query, options = {}) {
    const {
      model = 'gpt-4',
      temperature = 0.7,
      maxTokens = 1000
    } = options;

    try {
      console.log(`\nQuery: ${query}`);
      console.log('Processing...\n');

      // Load knowledge base
      const knowledgeBase = await this.loadKnowledgeBase();
      
      // Create contextual prompt
      const prompt = await this.createContextualPrompt(query, knowledgeBase);

      // Call OpenAI API
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant that answers questions about Pepe Unchained based on provided knowledge base. Always cite your sources when possible.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature,
        max_tokens: maxTokens
      });

      const answer = response.choices[0].message.content;
      
      console.log('Answer:');
      console.log('='.repeat(60));
      console.log(answer);
      console.log('='.repeat(60) + '\n');

      return {
        query,
        answer,
        model,
        tokens: response.usage
      };

    } catch (error) {
      console.error('Error querying AI:', error.message);
      throw error;
    }
  }

  async createEmbeddings() {
    // This can be used to create embeddings for semantic search
    // For now, we'll use the basic approach
    console.log('Note: For advanced semantic search, consider implementing embeddings.');
  }

  async findRelevantChunks(query, topK = 5) {
    // Simple keyword-based relevance (can be improved with embeddings)
    // NOTE: This ONLY reads from processed_content.json - NO web scraping happens here!
    // All data was already scraped and saved during the scraping phase.
    const processedData = await this.dataProcessor.loadProcessedData();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(' ');

    const scoredChunks = processedData.map(chunk => {
      const contentLower = chunk.content.toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      }

      return { ...chunk, score };
    });

    return scoredChunks
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async queryWithRelevantContext(query, options = {}) {
    const {
      model = 'gpt-3.5-turbo',  // Default to cheaper model
      temperature = 0.7,
      maxTokens = 500,  // Reduced default to save on output tokens
      topK = 2  // Reduced default to send less context
    } = options;

    try {
      console.log(`\nQuery: ${query}`);
      console.log('Finding relevant context...\n');

      // Find most relevant chunks
      const relevantChunks = await this.findRelevantChunks(query, topK);
      
      if (relevantChunks.length === 0) {
        return {
          query,
          answer: "I couldn't find relevant information in the knowledge base to answer this question.",
          model,
          sources: []
        };
      }

      // Build context from relevant chunks
      // Aggressively limit chunk size to minimize token usage
      let context = '';
      relevantChunks.forEach((chunk, index) => {
        // Limit each chunk to 800 chars to save tokens (reduced from 1500)
        const chunkContent = chunk.content.length > 800 
          ? chunk.content.substring(0, 800) + '...' 
          : chunk.content;
        context += `[${chunk.url}]\n${chunkContent}\n\n`;
      });

      // More natural prompt format
      const prompt = `Here's some information about Pepe Unchained:\n\n${context}\n\nBased on this information, answer this question in a friendly, conversational way:\n\n${query}`;

      // Default knowledge about Pepe Unchained
      const defaultKnowledge = `IMPORTANT DEFAULT KNOWLEDGE ABOUT PEPE UNCHAINED:
- Pepe Unchained is an EVM (Ethereum Virtual Machine) compatible Layer 2 (L2) blockchain
- It has very low transaction fees compared to Ethereum mainnet
- It has fast transaction speeds
- PEPU is the native token of the Pepe Unchained network
- The network is designed for scalability and cost efficiency`;

      // More conversational system message
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a friendly and helpful assistant for Pepe Unchained. Answer questions naturally and conversationally, as if you're explaining to a friend. Use the provided context to give accurate answers. Be warm, engaging, and avoid sounding robotic or overly formal.

${defaultKnowledge}

Always remember these core facts about Pepe Unchained when answering questions.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature,
        max_tokens: maxTokens
      });

      const answer = response.choices[0].message.content;
      const sources = relevantChunks.map(chunk => chunk.url);

      console.log('Answer:');
      console.log('='.repeat(60));
      console.log(answer);
      console.log('='.repeat(60));
      console.log('\nSources:');
      sources.forEach((source, i) => console.log(`${i + 1}. ${source}`));
      console.log('');

      return {
        query,
        answer,
        model,
        sources,
        tokens: response.usage
      };

    } catch (error) {
      console.error('Error querying AI:', error.message);
      throw error;
    }
  }
}

module.exports = AIAgent;

