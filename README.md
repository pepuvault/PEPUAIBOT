# Pepe Unchained AI Agent

An AI agent powered by GPT that scrapes, processes, and trains on information from Pepe Unchained websites.

## Features

- 🔍 Web scraping from `pepeunchained.com` and `guide.pepeunchained.com`
- 📊 Data processing and chunking for efficient training
- 🤖 GPT-powered AI agent for answering questions
- 📝 Context-aware responses with source citations
- 💬 **Telegram bot integration** - Chat with the AI directly in Telegram!

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   ```

   **To get a Telegram bot token:**
   1. Open Telegram and search for `@BotFather`
   2. Send `/newbot` and follow the instructions
   3. Copy the token and add it to your `.env` file

## Usage

### Full Pipeline (Recommended)
Run the complete pipeline: scrape → process → ready for queries
```bash
node index.js full
```

### Step by Step

1. **Scrape websites:**
   ```bash
   node index.js scrape
   ```
   This will scrape content from both websites and save it to `data/scraped_content.json`

2. **Process data:**
   ```bash
   node index.js process
   ```
   This will clean and chunk the scraped data, saving to `data/processed_content.json`

3. **Query the AI:**
   ```bash
   node index.js query "What is Pepe Unchained?"
   ```

4. **Start Telegram bot:**
   ```bash
   node index.js telegram
   ```
   Then open Telegram, find your bot, and start chatting! 🚀

## Project Structure

```
pepu-ai/
├── scraper.js          # Web scraping logic
├── dataProcessor.js    # Data cleaning and chunking
├── aiAgent.js          # GPT integration and querying
├── telegramBot.js      # Telegram bot handler
├── index.js            # Main entry point
├── data/               # Scraped and processed data (generated)
│   ├── scraped_content.json
│   └── processed_content.json
└── .env                # Environment variables (create this)
```

## How It Works

1. **Scraping**: The scraper visits both websites, extracts text content, and follows internal links to gather comprehensive information.

2. **Processing**: The processor cleans the text, removes unnecessary content, and chunks it into manageable pieces for the AI to process.

3. **Querying**: When you ask a question, the AI agent:
   - Finds relevant chunks from the knowledge base
   - Creates a contextual prompt with the relevant information
   - Uses GPT to generate an answer based on the scraped data
   - Provides source citations

## Configuration

You can modify the following in the code:

- **Scraping limits**: Change `maxPages` parameter in `scraper.js`
- **Chunk size**: Adjust `maxChunkSize` in `dataProcessor.js`
- **GPT model**: Change `model` parameter in `aiAgent.js` (default: 'gpt-3.5-turbo' for cost efficiency)
- **Temperature**: Adjust `temperature` in `aiAgent.js` for response creativity

## Notes

- The scraper includes delays between requests to be respectful to the servers
- Processed data is chunked to fit within GPT's token limits
- The AI agent uses context-aware retrieval to find relevant information

## License

ISC

