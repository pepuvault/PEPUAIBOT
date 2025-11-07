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

        // Handle greetings and small talk
        const greetingResponse = this.handleGreeting(text);
        if (greetingResponse) {
          await this.bot.sendMessage(chatId, greetingResponse, { parse_mode: 'Markdown' });
          return;
        }

        // Check if asking about price or market cap - fetch immediately
        if (this.isPriceQuestion(text)) {
          try {
            const priceData = await this.priceAPI.getPEPUPrice();
            const priceResponse = this.formatPriceResponse(priceData);
            await this.bot.sendMessage(chatId, priceResponse, { parse_mode: 'Markdown' });
            return;
          } catch (error) {
            console.error('Error fetching price:', error);
            // Send error message instead of falling back to AI
            await this.bot.sendMessage(chatId, 
              '❌ Sorry, I couldn\'t fetch the current PEPU price right now. Please try again later or check GeckoTerminal directly.',
              { parse_mode: 'Markdown' }
            );
            return;
          }
        }

        // Detect question type to optimize token usage
        const questionType = this.detectQuestionType(text);
        const topK = questionType === 'simple' ? 1 : questionType === 'medium' ? 2 : 3;

        // Query the AI agent
        // Using gpt-3.5-turbo for cost efficiency (much cheaper than gpt-4)
        // Optimized for minimal token usage
        const response = await this.aiAgent.queryWithRelevantContext(text, {
          model: 'gpt-3.5-turbo',
          temperature: 0.8,  // Increased for more natural responses
          maxTokens: 500,
          topK: topK  // Dynamic based on question complexity
        });

        // Format the response - more natural, less robotic
        // Don't show sources to users
        let responseText = response.answer;

        // Split long messages (Telegram has a 4096 character limit)
        if (responseText.length > 4000) {
          const chunks = this.splitMessage(responseText, 4000);
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
          }
        } else {
          await this.bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        }

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

  stop() {
    this.bot.stopPolling();
    console.log('Telegram bot stopped.');
  }
}

module.exports = TelegramAIBot;

