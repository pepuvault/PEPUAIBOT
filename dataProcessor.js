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

