const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const path = require('path');
require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "SuperSecret123";

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint to generate encrypted link
app.post('/api/generate-link', (req, res) => {
    const { streamUrl } = req.body;
    if (!streamUrl) return res.status(400).json({ error: "URL is required" });

    // 1. Create a token with Timestamp (for expiration)
    const expiry = Date.now() + (3 * 60 * 60 * 1000); // 3 hours valid
    const dataToEncrypt = JSON.stringify({ url: streamUrl, exp: expiry });
    
    // 2. Encrypt the data
    const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, SECRET_KEY).toString();
    const safeToken = Buffer.from(encrypted).toString('base64');

    const liveLink = `${req.protocol}://${req.get('host')}/watch?token=${encodeURIComponent(safeToken)}`;
    res.json({ liveLink });
});

// Endpoint to validate and play
app.get('/watch', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API for the player to get the real source
app.get('/api/get-source', (req, res) => {
    try {
        const token = req.query.token;
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const bytes = CryptoJS.AES.decrypt(decoded, SECRET_KEY);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

        if (Date.now() > decryptedData.exp) {
            return res.status(403).json({ error: "Link Expired" });
        }

        res.json({ source: decryptedData.url });
    } catch (e) {
        res.status(400).json({ error: "Invalid Token" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

