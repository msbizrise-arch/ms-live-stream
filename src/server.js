const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "SuperSecret123";

let officialAppToken = "";
try {
    const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, '../token.json'), 'utf8'));
    officialAppToken = tokenData.app_token;
} catch (e) { console.log("Token logic ready"); }

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/generate-link', (req, res) => {
    const { streamUrl } = req.body;
    const expiry = Date.now() + (3 * 60 * 60 * 1000); 
    const data = JSON.stringify({ url: streamUrl, exp: expiry });
    const encrypted = CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
    const safeToken = Buffer.from(encrypted).toString('base64');
    res.json({ liveLink: `${req.protocol}://${req.get('host')}/watch?token=${encodeURIComponent(safeToken)}` });
});

app.get('/watch', (req, res) => { res.sendFile(path.join(__dirname, '../public/index.html')); });

app.get('/api/get-source', (req, res) => {
    try {
        const token = req.query.token;
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const bytes = CryptoJS.AES.decrypt(decoded, SECRET_KEY);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        const proxyUrl = `/proxy-stream?url=${encodeURIComponent(Buffer.from(decryptedData.url).toString('base64'))}`;
        res.json({ source: proxyUrl });
    } catch (e) { res.status(400).json({ error: "Invalid" }); }
});

// THE MASTER PROXY: It rewrites the M3U8 content
app.get('/proxy-stream', async (req, res) => {
    try {
        const encodedUrl = req.query.url;
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        const response = await axios({
            method: 'get',
            url: targetUrl,
            headers: { 
                'Authorization': `Bearer ${officialAppToken}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www.physicswallah.com/',
                'Origin': 'https://www.physicswallah.com'
            }
        });

        let content = response.data;

        // Agar file .m3u8 hai, toh andar ke links ko hamare proxy se badlo
        if (targetUrl.includes('.m3u8')) {
            content = content.replace(/^(?!#)(.+)$/gm, (match) => {
                const fullUrl = match.startsWith('http') ? match : baseUrl + match;
                return `/proxy-stream?url=${encodeURIComponent(Buffer.from(fullUrl).toString('base64'))}`;
            });
            res.setHeader('Content-Type', 'application/x-mpegURL');
        } else {
            res.setHeader('Content-Type', 'video/MP2T'); // For .ts chunks
        }

        res.send(content);
    } catch (e) {
        res.status(500).send("Stream Error");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running`));
