const TelegramBot = require('node-telegram-bot-api');
const AIAgent = require('./aiAgent');
const PriceAPI = require('./priceApi');

class TelegramAIBot {
  constructor(telegramToken, openaiApiKey) {
    if (!telegramToken) {
      throw new Error('Telegram bot token is required. Set TELEGRAM_BOT_TOKEN in .env file');
    }
    
    this.bot = new TelegramBot(telegramToken, { polling: true });
    this.aiAgent = new AIAgent(openaiApiKey);
    this.priceAPI = new PriceAPI();
    // Store conversation context per chat: { lastTopic, lastQuestion, waitingForFollowUp }
    this.conversationContext = new Map();
    this.setupHandlers();
  }

  setupHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = `🤖 *Welcome to Pepe Unchained AI Agent!*

I'm an AI assistant trained on information from:
• pepeunchained.com
• guide.pepeunchained.com

You can ask me anything about Pepe Unchained!

*Commands:*
/start - Show this welcome message
/help - Show help information
/status - Check if I'm ready to answer questions

Just send me a message and I'll answer based on the knowledge base! 🚀`;

      this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `*Pepe Unchained AI Agent Help*

I can answer questions about Pepe Unchained based on scraped information from the official websites.

*How to use:*
Simply send me any question about Pepe Unchained, and I'll provide an answer with sources!

*Example questions:*
• What is Pepe Unchained?
• How does the token work?
• What are the features?
• Tell me about the roadmap

*Note:* Make sure the knowledge base has been scraped and processed first using:
\`node index.js full\``;

      this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const processedData = await this.aiAgent.dataProcessor.loadProcessedData();
        const statusMessage = `*Bot Status*

✅ Bot is running
✅ AI Agent is ready
📚 Knowledge base: ${processedData.length} chunks loaded

Ready to answer questions! 🚀`;

        this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot.sendMessage(chatId, `❌ Error: ${error.message}\n\nPlease run: node index.js full`);
      }
    });

    // Handle all text messages (questions)
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      // Skip commands
      if (text && text.startsWith('/')) {
        return;
      }

      // Skip if no text
      if (!text || text.trim().length === 0) {
        return;
      }

      // Show typing indicator
      this.bot.sendChatAction(chatId, 'typing');

      try {
        console.log(`[Telegram] Query from ${msg.from.username || msg.from.first_name}: ${text}`);

        // Get conversation context
        let context = this.conversationContext.get(chatId) || {};

        // Handle greetings and small talk (but reset context)
        const greetingResponse = this.handleGreeting(text);
        if (greetingResponse) {
          this.conversationContext.delete(chatId); // Reset context
          await this.bot.sendMessage(chatId, greetingResponse, { parse_mode: 'Markdown' });
          return;
        }

        // Check if this is a "yes" response to a follow-up question
        if (this.isYesResponse(text) && context.waitingForFollowUp && context.lastTopic) {
          // Create a more specific follow-up query based on the topic
          let followUpQuery = `Tell me more about ${context.lastTopic}`;
          
          // Make it more specific for better answers
          if (context.lastTopic === 'token' || context.lastTopic === 'pepu') {
            followUpQuery = 'What can I do with PEPU token?';
          } else if (context.lastTopic === 'staking') {
            followUpQuery = 'How do I stake PEPU tokens?';
          } else if (context.lastTopic === 'bridge') {
            followUpQuery = 'How do I bridge assets to Pepe Unchained?';
          } else if (context.lastTopic === 'dex') {
            followUpQuery = 'How do I use the DEX on Pepe Unchained?';
          } else if (context.lastTopic === 'explorer' || context.lastTopic === 'pepuscan') {
            followUpQuery = 'What is PepuScan and how do I use it?';
          }
          
          console.log(`[Telegram] Follow-up query: ${followUpQuery}`);
          
          // Clear waiting flag and mark this topic as asked
          context.waitingForFollowUp = false;
          if (!context.askedTopics) {
            context.askedTopics = [];
          }
          if (context.lastTopic) {
            context.askedTopics.push(context.lastTopic.toLowerCase());
          }
          context.lastTopic = null; // Clear to prevent asking about same topic again
          this.conversationContext.set(chatId, context);

          // Process the follow-up question
          await this.processQuery(chatId, followUpQuery, context);
          return;
        }

        // Check if this is a "no" response - clear context
        if (this.isNoResponse(text) && context.waitingForFollowUp) {
          this.conversationContext.delete(chatId);
          await this.bot.sendMessage(chatId, 'No problem! Ask me anything else about Pepe Unchained. 😊', { parse_mode: 'Markdown' });
          return;
        }

        // Check if asking about price or market cap - fetch immediately
        if (this.isPriceQuestion(text)) {
          try {
            const priceData = await this.priceAPI.getPEPUPrice();
            const priceResponse = this.formatPriceResponse(priceData);
            await this.bot.sendMessage(chatId, priceResponse, { parse_mode: 'Markdown' });
            // Reset context after price query
            this.conversationContext.delete(chatId);
            return;
          } catch (error) {
            console.error('Error fetching price:', error);
            await this.bot.sendMessage(chatId, 
              '❌ Sorry, I couldn\'t fetch the current PEPU price right now. Please try again later or check GeckoTerminal directly.',
              { parse_mode: 'Markdown' }
            );
            return;
          }
        }

        // Check if this looks like a new question (not a follow-up response)
        // If user asks a new question, reset context
        if (this.isNewQuestion(text)) {
          this.conversationContext.delete(chatId);
          context = {};
        }

        // Process the query
        await this.processQuery(chatId, text, context);

      } catch (error) {
        console.error('Error processing query:', error);
        
        let errorMessage = '';
        
        // Handle quota/billing errors - check multiple error properties
        const isQuotaError = error.message?.includes('quota') || 
                            error.message?.includes('429') || 
                            error.code === 'insufficient_quota' ||
                            error.error?.code === 'insufficient_quota' ||
                            error.type === 'insufficient_quota';
        
        if (isQuotaError) {
          console.log('Quota error detected, trying fallback mode...');
          
          // Try fallback mode FIRST before showing error
          try {
            const fallbackAnswer = await this.getFallbackAnswer(text);
            if (fallbackAnswer) {
              const fallbackMessage = '💳 *Using Fallback Mode*\n\n';
              const fallbackNote = 'OpenAI quota exceeded. Here\'s an answer from the knowledge base:\n\n';
              await this.bot.sendMessage(chatId, fallbackMessage + fallbackNote, { parse_mode: 'Markdown' });
              await this.bot.sendMessage(chatId, fallbackAnswer, { parse_mode: 'Markdown' });
              
              // Also send billing info
              const billingInfo = '\n\n💡 *To enable AI responses:*\n';
              const billingLink = 'Add billing: https://platform.openai.com/account/billing';
              await this.bot.sendMessage(chatId, billingInfo + billingLink, { parse_mode: 'Markdown' });
              return;
            }
          } catch (fallbackError) {
            console.error('Fallback error:', fallbackError);
          }
          
          // If fallback fails, show error message
          errorMessage += '💳 *OpenAI API Quota Exceeded*\n\n';
          errorMessage += 'Your OpenAI API quota has been exceeded.\n\n';
          errorMessage += '*To fix this:*\n';
          errorMessage += '1. Add billing: https://platform.openai.com/account/billing\n';
          errorMessage += '2. Check usage: https://platform.openai.com/usage\n\n';
          errorMessage += 'Sorry, fallback mode also failed. Please set up billing to continue.';
          
        } else if (error.message.includes('No processed data') || error.message.includes('ENOENT')) {
          errorMessage += '📚 *Knowledge base not found!*\n\n';
          errorMessage += 'The bot needs to scrape and process the websites first.\n\n';
          errorMessage += 'Please run this command in your terminal:\n';
          errorMessage += '```\nnode index.js full\n```\n\n';
          errorMessage += 'This will:\n';
          errorMessage += '1. Scrape pepeunchained.com\n';
          errorMessage += '2. Scrape guide.pepeunchained.com\n';
          errorMessage += '3. Process the data\n\n';
          errorMessage += 'Once complete, you can ask me questions again! 🚀';
        } else {
          errorMessage += `❌ Sorry, I encountered an error: ${error.message}\n\n`;
          errorMessage += 'Please try again or contact the administrator.';
        }

        this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
      }
    });

    // Error handling
    this.bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });

    console.log('🤖 Telegram bot is running!');
    console.log('Send /start to your bot to begin chatting.');
  }

  handleGreeting(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Greetings
    const greetings = ['hey', 'hi', 'hello', 'hey there', 'hi there', 'heyy', 'hii', 'sup', 'whats up', 'yo'];
    if (greetings.some(g => lowerMessage === g || lowerMessage.startsWith(g + ' '))) {
      return `Hey! 👋\n\nI'm your Pepe Unchained assistant. Ask me anything about Pepe Unchained, like:\n• What is Pepe Unchained?\n• How do I stake tokens?\n• How to bridge funds?\n\nWhat would you like to know?`;
    }

    // Thanks/acknowledgments
    if (lowerMessage.match(/^(thanks|thank you|thx|ty|appreciate it)/)) {
      return `You're welcome! 😊\n\nFeel free to ask if you need anything else about Pepe Unchained!`;
    }

    // Goodbye
    if (lowerMessage.match(/^(bye|goodbye|see ya|later|cya)/)) {
      return `See you later! 👋\n\nCome back anytime if you have questions about Pepe Unchained!`;
    }

    // How are you
    if (lowerMessage.match(/^(how are you|how\'?s it going|what\'?s up|wassup)/)) {
      return `I'm doing great, thanks for asking! 😊\n\nI'm here to help you learn about Pepe Unchained. What can I help you with today?`;
    }

    return null;
  }

  isPriceQuestion(text) {
    const lowerText = text.toLowerCase();
    const priceKeywords = [
      'price', 'pric', 'cost', 'worth', 'value',
      'market cap', 'marketcap', 'mc', 'market capitalization',
      'volume', 'liquidity', 'trading', 'chart'
    ];
    
    const pepuKeywords = ['pepu', 'pepe unchained', 'token'];
    
    // Check if question mentions price-related terms AND PEPU
    const hasPriceKeyword = priceKeywords.some(keyword => lowerText.includes(keyword));
    const hasPepuKeyword = pepuKeywords.some(keyword => lowerText.includes(keyword));
    
    // If asking about price/MC and mentions PEPU, fetch price data
    if (hasPriceKeyword && (hasPepuKeyword || lowerText.includes('what') || lowerText.includes('how much'))) {
      return true;
    }
    
    return false;
  }

  formatPriceResponse(priceData) {
    // Safe formatting with fallbacks
    const price = priceData?.priceUSD ? priceData.priceUSD.toFixed(6) : 'N/A';
    const change24h = priceData?.priceChange24h ? priceData.priceChange24h.toFixed(2) : '0.00';
    const changeValue = priceData?.priceChange24h || 0;
    const changeEmoji = changeValue >= 0 ? '📈' : '📉';
    const changeDirection = changeValue >= 0 ? 'up' : 'down';
    
    const marketCap = priceData?.marketCap && priceData.marketCap > 0 
      ? (priceData.marketCap / 1000000).toFixed(2) + 'M' 
      : 'N/A';
    const volume = priceData?.volume24h && priceData.volume24h > 0
      ? (priceData.volume24h / 1000000).toFixed(2) + 'M'
      : 'N/A';
    const liquidity = priceData?.liquidity && priceData.liquidity > 0
      ? (priceData.liquidity / 1000000).toFixed(2) + 'M'
      : 'N/A';

    // More conversational format
    let response = `Hey! Here's the current PEPU price info:\n\n`;
    response += `💵 PEPU is currently trading at *$${price}*\n`;
    response += `${changeEmoji} It's ${changeDirection} *${Math.abs(changeValue).toFixed(2)}%* in the last 24 hours\n\n`;
    response += `Here's some market context:\n`;
    response += `• Market cap is sitting at around *$${marketCap}*\n`;
    response += `• 24-hour trading volume is *$${volume}*\n`;
    response += `• Current liquidity is *$${liquidity}*\n\n`;
    response += `_Live data from GeckoTerminal_`;

    return response;
  }

  detectQuestionType(query) {
    const lowerQuery = query.toLowerCase();
    
    // Simple questions - single concept, basic info
    const simplePatterns = [
      /^what is .+\??/,
      /^what\'?s .+\?/,
      /^tell me about .+/,
      /^explain .+/,
      /^who is .+/,
      /^when is .+/,
      /^where is .+/
    ];
    
    // Complex questions - multiple concepts, comparisons, how-to
    const complexPatterns = [
      /how to .+/,
      /how does .+ work/,
      /what is the difference between/,
      /compare .+/,
      /why does .+/,
      /what are the steps/,
      /how do i .+/
    ];

    if (simplePatterns.some(pattern => pattern.test(lowerQuery))) {
      return 'simple';
    } else if (complexPatterns.some(pattern => pattern.test(lowerQuery))) {
      return 'complex';
    }
    
    return 'medium';
  }

  async getFallbackAnswer(query) {
    try {
      console.log('[Fallback] Searching knowledge base for:', query);
      
      // Detect question type for fallback too
      const questionType = this.detectQuestionType(query);
      const topK = questionType === 'simple' ? 1 : questionType === 'medium' ? 2 : 3;
      
      // Get relevant chunks from knowledge base without GPT
      const relevantChunks = await this.aiAgent.findRelevantChunks(query, topK);
      
      console.log(`[Fallback] Found ${relevantChunks.length} relevant chunks`);
      
      if (relevantChunks.length === 0) {
        console.log('[Fallback] No relevant chunks found');
        return null;
      }

      // Build a simple answer from the most relevant chunks
      let answer = `📚 *Answer from Knowledge Base*\n\n`;
      
      // Use the most relevant chunk as the main answer
      const mainChunk = relevantChunks[0];
      answer += `${mainChunk.content.substring(0, 800)}${mainChunk.content.length > 800 ? '...' : ''}\n\n`;
      
      answer += `*Source:* ${mainChunk.url}\n\n`;
      
      // Add other relevant sources if available
      if (relevantChunks.length > 1) {
        answer += `*Additional Sources:*\n`;
        relevantChunks.slice(1).forEach((chunk, index) => {
          answer += `${index + 2}. ${chunk.url}\n`;
        });
      }

      return answer;
    } catch (error) {
      console.error('[Fallback] Error in fallback answer:', error);
      return null;
    }
  }

  splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = line + '\n';
        } else {
          // Line itself is too long, split it
          chunks.push(line.substring(0, maxLength));
          currentChunk = line.substring(maxLength) + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  async processQuery(chatId, query, context) {
    // Check if this is a token-related question - add price info
    const isTokenQuestion = this.isTokenQuestion(query);
    let priceInfo = '';
    
    if (isTokenQuestion) {
      try {
        const priceData = await this.priceAPI.getPEPUPrice();
        priceInfo = this.formatPriceInfoShort(priceData);
      } catch (error) {
        console.error('Error fetching price for token question:', error);
        // Continue without price if API fails
      }
    }

    // Detect question type to optimize token usage
    const questionType = this.detectQuestionType(query);
    const topK = questionType === 'simple' ? 1 : questionType === 'medium' ? 2 : 3;

    // Query the AI agent with shorter responses
    const response = await this.aiAgent.queryWithRelevantContext(query, {
      model: 'gpt-3.5-turbo',
      temperature: 0.8,
      maxTokens: 200,  // Reduced from 500 to make responses shorter
      topK: topK
    });

    // Get shorter, concise answer
    let responseText = this.makeResponseConcise(response.answer);

    // Add price info if token question
    if (priceInfo) {
      responseText = `${responseText}\n\n${priceInfo}`;
    }

    // Send the response
    await this.bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    // Track what topics we've discussed
    if (!context.askedTopics) {
      context.askedTopics = [];
    }
    
    // Add current topic to asked topics
    const currentTopic = this.extractMainTopic(query, response.answer);
    if (currentTopic) {
      context.askedTopics.push(currentTopic.toLowerCase());
    }

    // Generate and send follow-up question (but don't repeat topics)
    const followUpTopic = this.extractMainTopic(query, response.answer);
    
    // Don't ask follow-up if:
    // 1. Same topic as last one
    // 2. Topic already asked about
    // 3. No topic found
    // 4. Topic is too generic (token, dex, etc.) and we just answered about it
    const isGenericTopic = ['token', 'dex', 'blockchain', 'network'].includes(followUpTopic?.toLowerCase());
    const alreadyAsked = context.askedTopics.includes(followUpTopic?.toLowerCase());
    
    if (followUpTopic && 
        followUpTopic !== context.lastTopic && 
        !alreadyAsked &&
        !(isGenericTopic && context.lastQuestion?.toLowerCase().includes(followUpTopic.toLowerCase()))) {
      const followUpQuestion = `Would you like to know more about ${followUpTopic}?`;
      
      // Update context
      context.lastTopic = followUpTopic;
      context.lastQuestion = query;
      context.waitingForFollowUp = true;
      this.conversationContext.set(chatId, context);

      await this.bot.sendMessage(chatId, followUpQuestion, { parse_mode: 'Markdown' });
    } else {
      // Clear context if no follow-up or same topic
      this.conversationContext.delete(chatId);
    }
  }

  makeResponseConcise(answer) {
    // Limit response to 2-3 sentences max
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 2) {
      return answer.trim();
    }
    
    // Take first 2-3 sentences
    const concise = sentences.slice(0, 3).join('. ').trim();
    return concise + (concise.endsWith('.') ? '' : '.');
  }

  extractMainTopic(query, answer) {
    // Extract key topic from query or answer
    const lowerQuery = query.toLowerCase();
    const lowerAnswer = answer.toLowerCase();
    
    // Common topics to look for (prioritized, more specific first)
    const topics = [
      'pepuscan', 'block explorer', 'explorer', 'scan',
      'staking', 'bridge', 'pump pad', 'pumppad',
      'fees', 'gas', 'transactions', 'wallet', 'trading',
      'roadmap', 'features', 'ecosystem', 'applications',
      'dex', 'blockchain', 'network'
    ];
    
    // Find topic mentioned in query or answer (prioritize specific topics)
    for (const topic of topics) {
      if (lowerQuery.includes(topic) || lowerAnswer.includes(topic)) {
        // Skip generic topics if we just answered about them
        if (['token', 'dex', 'blockchain'].includes(topic) && lowerQuery.includes('how do i use')) {
          return null; // Don't ask follow-up for "how to use" questions
        }
        return topic;
      }
    }
    
    // Extract noun phrases from query (simple extraction) - but avoid if too generic
    const words = query.toLowerCase().split(/\s+/);
    const questionWords = ['what', 'how', 'when', 'where', 'why', 'who', 'is', 'are', 'does', 'do', 'can', 'will', 'tell', 'me', 'about', 'more', 'use', 'the', 'on'];
    const filtered = words.filter(w => !questionWords.includes(w) && w.length > 3);
    
    // Avoid generic words
    const genericWords = ['token', 'dex', 'blockchain', 'network', 'pepe', 'unchained'];
    const specificWords = filtered.filter(w => !genericWords.includes(w));
    
    if (specificWords.length > 0) {
      return specificWords[0];
    }
    
    return null;
  }

  isTokenQuestion(text) {
    const lowerText = text.toLowerCase();
    const tokenKeywords = ['token', 'pepu', 'price', 'cost', 'worth', 'value', 'trading', 'market'];
    return tokenKeywords.some(keyword => lowerText.includes(keyword));
  }

  formatPriceInfoShort(priceData) {
    const price = priceData?.priceUSD ? priceData.priceUSD.toFixed(6) : 'N/A';
    const change24h = priceData?.priceChange24h ? priceData.priceChange24h.toFixed(2) : '0.00';
    const changeValue = priceData?.priceChange24h || 0;
    const changeEmoji = changeValue >= 0 ? '📈' : '📉';
    
    return `💵 *Current PEPU Price:* $${price} ${changeEmoji} ${Math.abs(changeValue).toFixed(2)}% (24h)`;
  }

  isYesResponse(text) {
    const lowerText = text.toLowerCase().trim();
    const yesPatterns = ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'yea', 'ya', 'definitely', 'absolutely'];
    return yesPatterns.some(pattern => lowerText === pattern || lowerText.startsWith(pattern + ' '));
  }

  isNoResponse(text) {
    const lowerText = text.toLowerCase().trim();
    const noPatterns = ['no', 'nope', 'nah', 'not really', 'not interested'];
    return noPatterns.some(pattern => lowerText === pattern || lowerText.startsWith(pattern + ' '));
  }

  isNewQuestion(text) {
    const lowerText = text.toLowerCase().trim();
    // Check if it starts with question words or contains question mark
    const questionIndicators = ['what', 'how', 'when', 'where', 'why', 'who', 'tell me', 'explain', 'can you', 'do you'];
    return text.includes('?') || questionIndicators.some(indicator => lowerText.startsWith(indicator));
  }

  stop() {
    this.bot.stopPolling();
    console.log('Telegram bot stopped.');
  }
}

module.exports = TelegramAIBot;

