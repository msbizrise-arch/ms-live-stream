const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "SuperSecret123";

let officialAppToken = "";
try {
    const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, '../token.json'), 'utf8'));
    officialAppToken = tokenData.app_token.trim();
} catch (e) { console.log("Token Load Error!"); }

// CORS is critical - allows your browser to talk to this server freely
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
        
        res.json({ 
            source: decryptedData.url,
            auth: officialAppToken 
        });
    } catch (e) { res.status(400).json({ error: "Invalid Link" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine Online: Port ${PORT}`));
