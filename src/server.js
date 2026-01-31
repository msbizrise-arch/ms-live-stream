const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const path = require('path');
const axios = require('axios'); // Isse app ka data fetch hoga
const fs = require('fs');
require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "SuperSecret123";

// 1. Official App Token Load Karo (App ki file se)
let officialAppToken = "";
try {
    const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, '../token.json'), 'utf8'));
    officialAppToken = tokenData.app_token;
} catch (e) {
    console.log("Warning: token.json not found. Request will proceed without custom headers.");
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// [Logic 1] Generate Encrypted Link
app.post('/api/generate-link', (req, res) => {
    const { streamUrl } = req.body;
    if (!streamUrl) return res.status(400).json({ error: "URL is required" });

    const expiry = Date.now() + (3 * 60 * 60 * 1000); // 3 Hours
    const dataToEncrypt = JSON.stringify({ url: streamUrl, exp: expiry });
    
    const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, SECRET_KEY).toString();
    const safeToken = Buffer.from(encrypted).toString('base64');

    const liveLink = `${req.protocol}://${req.get('host')}/watch?token=${encodeURIComponent(safeToken)}`;
    res.json({ liveLink });
});

// [Logic 2] Watch Route
app.get('/watch', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// [Logic 3] The Decryptor & Source Provider
app.get('/api/get-source', (req, res) => {
    try {
        const token = req.query.token;
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const bytes = CryptoJS.AES.decrypt(decoded, SECRET_KEY);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

        if (Date.now() > decryptedData.exp) {
            return res.status(403).json({ error: "Link Expired" });
        }

        // Hum direct URL dene ke bajaye Proxy URL denge taaki App Token attach ho sake
        const proxyUrl = `/proxy-stream?url=${encodeURIComponent(Buffer.from(decryptedData.url).toString('base64'))}`;
        res.json({ source: proxyUrl });
    } catch (e) {
        res.status(400).json({ error: "Invalid Token" });
    }
});

// [Logic 4] THE PROXY ENGINE (Ye hi tumhare app ka security bypass karega)
app.get('/proxy-stream', async (req, res) => {
    try {
        const encodedUrl = req.query.url;
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

        // Render Server App ko request bhejega 'Official Token' ke saath
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'Authorization': `Bearer ${officialAppToken}`, // Injecting the secret token
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) ResonanceApp/1.0',
                'Referer': 'https://resonance.edu.in/' // Example: App ka domain
            }
        });

        // App se jo data aa raha hai use seedha Chrome ko 'Pipe' kar do
        response.data.pipe(res);
    } catch (e) {
        res.status(500).send("Bypass Failed: App server rejected the token.");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
