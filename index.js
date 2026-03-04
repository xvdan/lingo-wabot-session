const express = require('express');
const path = require('path');
const app = express();
__path = process.cwd();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 50900;
const { 
  qrRoute,
  pairRoute
} = require('./routes');
require('events').EventEmitter.defaultMaxListeners = 2000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/qr', qrRoute);
app.use('/pair', pairRoute);

app.get('/pair-page', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/qr-page', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'LINGO-BOT Session',
        timestamp: new Date().toISOString()
    });
});

// At the bottom of your index.js, change this line:
app.listen(PORT, '0.0.0.0', () => {  // Add '0.0.0.0'
    console.log(`
    ╔══════════════════════════════════╗
    ║     LINGO BOT DEPLOYMENT         ║
    ╠══════════════════════════════════╣
    ║  Server Running Successfully!    ║
    ║  Port: ${PORT}                       ║
    ║  URL: http://localhost:${PORT}       ║
    ╚══════════════════════════════════╝
    `);
});;

module.exports = app;