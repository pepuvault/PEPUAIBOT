const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class WebScraper {
  constructor() {
    this.baseUrl = 'https://pepeunchained.com';
    this.guideUrl = 'https://guide.pepeunchained.com';
    this.dataDir = path.join(__dirname, 'data');
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Error creating data directory:', error);
    }
  }

  async fetchPage(url) {
    try {
      console.log(`Fetching: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      return null;
    }
  }

  async extractLinks($, baseUrl) {
    const links = new Set();
    $('a[href]').each((i, elem) => {
      let href = $(elem).attr('href');
      if (href) {
        // Convert relative URLs to absolute
        if (href.startsWith('/')) {
          href = new URL(href, baseUrl).href;
        } else if (href.startsWith('./') || !href.startsWith('http')) {
          href = new URL(href, baseUrl).href;
        }
        // Only include links from the same domain
        if (href.includes(baseUrl)) {
          links.add(href);
        }
      }
    });
    return Array.from(links);
  }

  async scrapePage(url, visited = new Set()) {
    if (visited.has(url)) {
      return null;
    }
    visited.add(url);

    const html = await this.fetchPage(url);
    if (!html) {
      return null;
    }

    const $ = cheerio.load(html);
    
    // Remove script and style tags
    $('script, style, nav, footer, header').remove();
    
    // Extract main content
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const content = this.extractTextContent($);
    
    const pageData = {
      url,
      title,
      content,
      scrapedAt: new Date().toISOString()
    };

    return pageData;
  }

  extractTextContent($) {
    // Try to find main content areas
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      'body'
    ];

    let content = '';
    for (const selector of mainSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // If no main content found, extract from body
    if (!content) {
      content = $('body').text();
    }

    // Clean up the content
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  async scrapeWebsite(baseUrl, maxPages = 50) {
    const visited = new Set();
    const pages = [];
    const toVisit = [baseUrl];

    console.log(`\nStarting to scrape: ${baseUrl}`);
    console.log(`Max pages: ${maxPages}\n`);

    while (toVisit.length > 0 && pages.length < maxPages) {
      const url = toVisit.shift();
      
      if (visited.has(url)) {
        continue;
      }

      const pageData = await this.scrapePage(url, visited);
      
      if (pageData && pageData.content) {
        pages.push(pageData);
        console.log(`✓ Scraped: ${pageData.title} (${url})`);

        // Extract and add new links to visit
        const html = await this.fetchPage(url);
        if (html) {
          const $ = cheerio.load(html);
          const links = await this.extractLinks($, baseUrl);
          links.forEach(link => {
            if (!visited.has(link) && !toVisit.includes(link)) {
              toVisit.push(link);
            }
          });
        }
      }

      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return pages;
  }

  async scrapeAll() {
    await this.ensureDataDirectory();

    console.log('='.repeat(60));
    console.log('Starting Web Scraping Process');
    console.log('='.repeat(60));

    // Scrape main website
    const mainPages = await this.scrapeWebsite(this.baseUrl, 30);
    
    // Scrape guide website
    const guidePages = await this.scrapeWebsite(this.guideUrl, 30);

    // Combine all pages
    const allPages = [
      ...mainPages,
      ...guidePages
    ];

    // Save to file
    const outputFile = path.join(this.dataDir, 'scraped_content.json');
    await fs.writeFile(outputFile, JSON.stringify(allPages, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('Scraping Complete!');
    console.log(`Total pages scraped: ${allPages.length}`);
    console.log(`Data saved to: ${outputFile}`);
    console.log('='.repeat(60) + '\n');

    return allPages;
  }
}

module.exports = WebScraper;

