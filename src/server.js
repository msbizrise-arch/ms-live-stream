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
    officialAppToken = tokenData.app_token.trim();
} catch (e) { console.log("Token error"); }

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

app.get('/proxy-stream', async (req, res) => {
    try {
        const encodedUrl = req.query.url;
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
        const parsedUrl = new URL(targetUrl);
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        const response = await axios({
            method: 'get',
            url: targetUrl,
            headers: { 
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; Pixel 6 Build/SD1A.210817.036)',
                'Authorization': `Bearer ${officialAppToken}`,
                'X-Requested-With': 'com.pw.physicswallah',
                'Host': parsedUrl.host,
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Origin': 'https://www.physicswallah.com',
                'Referer': 'https://www.physicswallah.com/'
            },
            responseType: targetUrl.includes('.m3u8') ? 'text' : 'stream'
        });

        if (targetUrl.includes('.m3u8')) {
            let content = response.data;
            content = content.replace(/^(?!#)(.+)$/gm, (match) => {
                let fullUrl = match.startsWith('http') ? match : baseUrl + match;
                // Cloudfront signatures ko preserve karna zaroori hai
                if (parsedUrl.search && !fullUrl.includes('?')) {
                    fullUrl += parsedUrl.search;
                }
                return `/proxy-stream?url=${encodeURIComponent(Buffer.from(fullUrl).toString('base64'))}`;
            });
            res.setHeader('Content-Type', 'application/x-mpegURL');
            res.send(content);
        } else {
            res.setHeader('Content-Type', 'video/MP2T');
            response.data.pipe(res);
        }
    } catch (e) {
        const status = e.response ? e.response.status : 500;
        console.error(`Status: ${status} | PW Blocked Request`);
        res.status(status).send("Access Denied");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bypass Engine Ready`));
