const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "SuperSecret123";

// 1. Official App Token Load
let officialAppToken = "";
try {
    const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, '../token.json'), 'utf8'));
    officialAppToken = tokenData.app_token;
} catch (e) {
    console.log("Critical: token.json missing or invalid.");
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/generate-link', (req, res) => {
    const { streamUrl } = req.body;
    if (!streamUrl) return res.status(400).json({ error: "URL is required" });

    const expiry = Date.now() + (3 * 60 * 60 * 1000);
    const dataToEncrypt = JSON.stringify({ url: streamUrl, exp: expiry });
    
    const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, SECRET_KEY).toString();
    const safeToken = Buffer.from(encrypted).toString('base64');

    const liveLink = `${req.protocol}://${req.get('host')}/watch?token=${encodeURIComponent(safeToken)}`;
    res.json({ liveLink });
});

app.get('/watch', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/api/get-source', (req, res) => {
    try {
        const token = req.query.token;
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const bytes = CryptoJS.AES.decrypt(decoded, SECRET_KEY);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

        if (Date.now() > decryptedData.exp) {
            return res.status(403).json({ error: "Link Expired" });
        }

        // Proxy URL with Base64 encoding
        const proxyUrl = `/proxy-stream?url=${encodeURIComponent(Buffer.from(decryptedData.url).toString('base64'))}`;
        res.json({ source: proxyUrl });
    } catch (e) {
        res.status(400).json({ error: "Invalid Token" });
    }
});

// [Logic 4] THE ENHANCED PROXY ENGINE
app.get('/proxy-stream', async (req, res) => {
    try {
        const encodedUrl = req.query.url;
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 10000,
            headers: {
                'Authorization': `Bearer ${officialAppToken}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www.physicswallah.com/',
                'Origin': 'https://www.physicswallah.com',
                'Accept': '*/*',
                'Cache-Control': 'no-cache'
            }
        });

        // Set correct headers for HLS streaming
        res.setHeader('Content-Type', 'application/x-mpegURL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        response.data.pipe(res);
    } catch (e) {
        console.error("Proxy Failed:", e.message);
        res.status(500).json({ error: "Bypass Failed", detail: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
