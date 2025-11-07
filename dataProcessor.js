const fs = require('fs').promises;
const path = require('path');

class DataProcessor {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.inputFile = path.join(this.dataDir, 'scraped_content.json');
    this.outputFile = path.join(this.dataDir, 'processed_content.json');
  }

  async loadScrapedData() {
    try {
      const data = await fs.readFile(this.inputFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading scraped data:', error.message);
      return [];
    }
  }

  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\w\s\.,!?;:()\-'"]/g, '')
      .trim();
  }

  chunkText(text, maxChunkSize = 2000, overlap = 200) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 10));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  extractMetadata(page) {
    return {
      url: page.url,
      title: page.title,
      source: page.url.includes('guide.pepeunchained.com') ? 'guide' : 'main',
      scrapedAt: page.scrapedAt
    };
  }

  getManualKnowledgeEntries() {
    // Add important information that might not be scraped well
    const entries = [
      {
        url: 'https://pepuscan.com',
        title: 'PepuScan - Pepe Unchained Block Explorer',
        source: 'manual',
        scrapedAt: new Date().toISOString(),
        chunkIndex: 0,
        totalChunks: 1,
        content: 'PepuScan is the official block explorer for Pepe Unchained. You can use PepuScan (pepuscan.com) to view transactions, blocks, addresses, smart contracts, and all on-chain activity on the Pepe Unchained network. It works similar to Etherscan but for the Pepe Unchained Layer 2 blockchain. You can search for transaction hashes, wallet addresses, contract addresses, and block numbers to see detailed information about network activity.'
      },
      {
        url: 'https://pepeunchained.com',
        title: 'Pepe Unchained Key Information',
        source: 'manual',
        scrapedAt: new Date().toISOString(),
        chunkIndex: 0,
        totalChunks: 1,
        content: 'Pepe Unchained is an EVM-compatible Layer 2 blockchain built on Ethereum. Key features: Very low gas fees compared to Ethereum mainnet, fast transaction speeds, supports all Ethereum tools and wallets like MetaMask. PEPU is the native token. The network has a DEX for trading, bridge functionality to move assets between Ethereum and Pepe Unchained, staking capabilities for PEPU tokens, and PepuScan block explorer for viewing on-chain data.'
      },
      {
        url: 'https://pepeunchained.com',
        title: 'Pump Pad - Launch Your Meme Coin',
        source: 'manual',
        scrapedAt: new Date().toISOString(),
        chunkIndex: 0,
        totalChunks: 1,
        content: 'Pump Pad is a platform on Pepe Unchained that allows users to launch their own meme coins. It is part of the Pepe Unchained ecosystem and integrates with the Layer 2 blockchain infrastructure. Pump Pad enables creators to launch meme coins on the Pepe Unchained network, taking advantage of the low gas fees and fast transaction speeds. It is featured on the main Pepe Unchained website as one of the key products in the ecosystem.'
      }
    ];
    
    // Calculate contentLength
    return entries.map(entry => ({
      ...entry,
      contentLength: entry.content.length
    }));
  }

  async processData() {
    console.log('='.repeat(60));
    console.log('Processing Scraped Data');
    console.log('='.repeat(60));

    const rawData = await this.loadScrapedData();
    
    if (rawData.length === 0) {
      console.error('No scraped data found. Please run the scraper first.');
      return [];
    }

    const processedData = [];

    // Add manual knowledge entries first (high priority)
    const manualEntries = this.getManualKnowledgeEntries();
    processedData.push(...manualEntries);
    console.log(`Added ${manualEntries.length} manual knowledge entries`);

    for (const page of rawData) {
      const cleanedContent = this.cleanText(page.content);
      
      if (!cleanedContent || cleanedContent.length < 50) {
        continue; // Skip pages with too little content
      }

      const chunks = this.chunkText(cleanedContent);
      const metadata = this.extractMetadata(page);

      for (let i = 0; i < chunks.length; i++) {
        processedData.push({
          ...metadata,
          chunkIndex: i,
          totalChunks: chunks.length,
          content: chunks[i],
          contentLength: chunks[i].length
        });
      }
    }

    // Save processed data
    await fs.writeFile(this.outputFile, JSON.stringify(processedData, null, 2));

    // Generate summary
    const totalChunks = processedData.length;
    const totalChars = processedData.reduce((sum, item) => sum + item.contentLength, 0);
    const avgChunkSize = Math.round(totalChars / totalChunks);

    console.log(`\nProcessing Complete!`);
    console.log(`Total chunks: ${totalChunks}`);
    console.log(`Total characters: ${totalChars.toLocaleString()}`);
    console.log(`Average chunk size: ${avgChunkSize} characters`);
    console.log(`Processed data saved to: ${this.outputFile}\n`);

    return processedData;
  }

  async getTrainingText() {
    const processedData = await this.loadProcessedData();
    
    let trainingText = '# Pepe Unchained Knowledge Base\n\n';
    trainingText += 'This document contains information about Pepe Unchained scraped from pepeunchained.com and guide.pepeunchained.com\n\n';
    trainingText += '='.repeat(60) + '\n\n';

    for (const chunk of processedData) {
      trainingText += `## ${chunk.title}\n`;
      trainingText += `Source: ${chunk.url}\n`;
      trainingText += `Source Type: ${chunk.source}\n\n`;
      trainingText += `${chunk.content}\n\n`;
      trainingText += '---\n\n';
    }

    return trainingText;
  }

  async loadProcessedData() {
    try {
      const data = await fs.readFile(this.outputFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading processed data:', error.message);
      return [];
    }
  }
}

module.exports = DataProcessor;

