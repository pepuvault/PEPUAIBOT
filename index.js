require('dotenv').config();
const WebScraper = require('./scraper');
const DataProcessor = require('./dataProcessor');
const AIAgent = require('./aiAgent');
const TelegramAIBot = require('./telegramBot');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'scrape':
      await runScraper();
      break;
    
    case 'process':
      await runProcessor();
      break;
    
    case 'query':
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('Error: Please provide a query');
        console.log('Usage: node index.js query "your question here"');
        process.exit(1);
      }
      await runQuery(query);
      break;
    
    case 'full':
      await runFullPipeline();
      break;
    
    case 'telegram':
    case 'bot':
      await runTelegramBot();
      break;
    
    case 'api':
    case 'server':
      await runAPIServer();
      break;
    
    default:
      printUsage();
      break;
  }
}

async function runScraper() {
  console.log('Starting web scraper...\n');
  const scraper = new WebScraper();
  await scraper.scrapeAll();
}

async function runProcessor() {
  console.log('Starting data processor...\n');
  const processor = new DataProcessor();
  await processor.processData();
}

async function runQuery(query) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in .env file');
    console.log('Please create a .env file with: OPENAI_API_KEY=your_key_here');
    process.exit(1);
  }

  const agent = new AIAgent(apiKey);
  
  // Use queryWithRelevantContext for better performance
  // Using gpt-3.5-turbo for cost efficiency
  await agent.queryWithRelevantContext(query, {
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 500,  // Reduced to save tokens
    topK: 2  // Reduced to send less context
  });
}

async function runFullPipeline() {
  console.log('Running full pipeline: Scrape -> Process -> Ready for queries\n');
  
  // Step 1: Scrape
  await runScraper();
  
  // Step 2: Process
  await runProcessor();
  
  console.log('\n✓ Full pipeline complete!');
  console.log('You can now use: node index.js query "your question"');
  console.log('Or start the Telegram bot: node index.js telegram');
}

async function runAPIServer() {
  console.log('Starting API server...\n');
  require('./api');
}

async function runTelegramBot() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!telegramToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN not found in .env file');
    console.log('Please create a .env file with: TELEGRAM_BOT_TOKEN=your_bot_token_here');
    console.log('\nTo get a bot token:');
    console.log('1. Open Telegram and search for @BotFather');
    console.log('2. Send /newbot and follow the instructions');
    console.log('3. Copy the token and add it to your .env file');
    process.exit(1);
  }

  if (!openaiApiKey) {
    console.error('Error: OPENAI_API_KEY not found in .env file');
    console.log('Please create a .env file with: OPENAI_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log('🤖 Starting Telegram bot...');
  console.log('Press Ctrl+C to stop the bot\n');

  const bot = new TelegramAIBot(telegramToken, openaiApiKey);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down bot...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\nShutting down bot...');
    bot.stop();
    process.exit(0);
  });
}

function printUsage() {
  console.log(`
Pepe Unchained AI Agent

Usage:
  node index.js scrape          - Scrape websites
  node index.js process          - Process scraped data
  node index.js query "question" - Query the AI agent
  node index.js full             - Run full pipeline (scrape + process)
  node index.js telegram         - Start Telegram bot
  node index.js api              - Start API server for prices/tokens

Examples:
  node index.js scrape
  node index.js process
  node index.js query "What is Pepe Unchained?"
  node index.js full
  node index.js telegram
  `);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };

