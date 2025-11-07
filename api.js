require('dotenv').config();
const express = require('express');
const PriceAPI = require('./priceApi');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const priceAPI = new PriceAPI();

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Pepe Unchained API',
    endpoints: {
      '/api/pepu/price': 'Get PEPU token price and market cap',
      '/api/pepu/trending': 'Get trending tokens on Pepe Unchained L2',
      '/api/pepu/top': 'Get top tokens by liquidity',
      '/api/health': 'Health check'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get PEPU price and market cap
app.get('/api/pepu/price', async (req, res) => {
  try {
    const priceData = await priceAPI.getPEPUPrice();
    res.json({
      success: true,
      data: priceData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get trending tokens
app.get('/api/pepu/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const tokens = await priceAPI.getTrendingTokens('eth', limit);
    res.json({
      success: true,
      count: tokens.length,
      data: tokens
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top tokens by liquidity
app.get('/api/pepu/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const tokens = await priceAPI.getTopTokens('eth', limit);
    res.json({
      success: true,
      count: tokens.length,
      data: tokens
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   GET /api/pepu/price - PEPU price & market cap`);
  console.log(`   GET /api/pepu/trending - Trending tokens`);
  console.log(`   GET /api/pepu/top - Top tokens by liquidity`);
});

module.exports = app;

