const axios = require('axios');
const cheerio = require('cheerio');

class PriceAPI {
  constructor() {
    // PEPU pool address from GeckoTerminal
    this.pepuPoolAddress = '0xb1b10b05aa043dd8d471d4da999782bc694993e3ecbe8e7319892b261b412ed5';
    this.baseUrl = 'https://api.geckoterminal.com/api/v2';
  }

  async getPEPUPrice() {
    try {
      // Get pool data from GeckoTerminal API
      const poolId = `eth/${this.pepuPoolAddress}`;
      const response = await axios.get(`${this.baseUrl}/networks/eth/pools/${this.pepuPoolAddress}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (response.data && response.data.data) {
        const pool = response.data.data;
        const attributes = pool.attributes;
        
        if (!attributes) {
          throw new Error('No attributes in API response');
        }
        
        // Extract price and market data - handle different response structures
        const baseToken = attributes.base_token || attributes.token_0 || {};
        const quoteToken = attributes.quote_token || attributes.token_1 || {};
        
        // Price in USD - try different possible field names
        const priceUSD = attributes.base_token_price_usd || 
                        attributes.price_usd || 
                        attributes.token_price_usd || 
                        0;
        const priceChange24h = attributes.price_change_percentage?.h24 || 
                              attributes.price_change_24h || 
                              0;
        
        // Volume and liquidity
        const volume24h = attributes.volume_usd?.h24 || 
                         attributes.volume_24h_usd || 
                         attributes.volume_usd || 
                         0;
        const liquidity = attributes.reserve_in_usd || 
                         attributes.liquidity_usd || 
                         attributes.total_liquidity_usd || 
                         0;
        const fdv = attributes.fdv_usd || 
                   attributes.fully_diluted_valuation_usd || 
                   0;
        
        return {
          symbol: baseToken.symbol || 'PEPU',
          name: baseToken.name || 'Pepe Unchained',
          priceUSD: parseFloat(priceUSD) || 0,
          priceChange24h: parseFloat(priceChange24h) || 0,
          volume24h: parseFloat(volume24h) || 0,
          liquidity: parseFloat(liquidity) || 0,
          marketCap: parseFloat(fdv) || 0,
          address: baseToken.address || '',
          poolAddress: this.pepuPoolAddress,
          timestamp: new Date().toISOString()
        };
      }

      throw new Error('Invalid API response structure');
    } catch (error) {
      console.error('Error fetching PEPU price:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data || {}, null, 2));
      }
      throw new Error(`Failed to fetch PEPU price: ${error.message}`);
    }
  }

  async getTrendingTokens(network = 'eth', limit = 20) {
    try {
      // Get trending tokens from GeckoTerminal
      const response = await axios.get(`${this.baseUrl}/networks/${network}/trending_pools`, {
        params: {
          page: 1,
          per_page: limit
        },
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.data) {
        return response.data.data.map(pool => {
          const attrs = pool.attributes;
          return {
            name: attrs.base_token?.name,
            symbol: attrs.base_token?.symbol,
            priceUSD: parseFloat(attrs.base_token_price_usd) || 0,
            priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
            volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
            liquidity: parseFloat(attrs.reserve_in_usd) || 0,
            address: attrs.base_token?.address,
            poolAddress: attrs.address,
            transactions24h: attrs.transactions?.h24 || 0
          };
        });
      }

      return [];
    } catch (error) {
      console.error('Error fetching trending tokens:', error.message);
      return [];
    }
  }

  async getTopTokens(network = 'eth', limit = 20) {
    try {
      // Get top pools by liquidity
      const response = await axios.get(`${this.baseUrl}/networks/${network}/pools`, {
        params: {
          page: 1,
          per_page: limit,
          sort: 'liquidity'
        },
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.data) {
        return response.data.data.map(pool => {
          const attrs = pool.attributes;
          return {
            name: attrs.base_token?.name,
            symbol: attrs.base_token?.symbol,
            priceUSD: parseFloat(attrs.base_token_price_usd) || 0,
            priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
            volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
            liquidity: parseFloat(attrs.reserve_in_usd) || 0,
            address: attrs.base_token?.address,
            poolAddress: attrs.address
          };
        });
      }

      return [];
    } catch (error) {
      console.error('Error fetching top tokens:', error.message);
      return [];
    }
  }
}

module.exports = PriceAPI;

