// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
// const fetch = require('node-fetch'); <--- REMOVED THIS LINE

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Model remains consistent

// Middleware to parse JSON bodies from the client
app.use(express.json({ limit: '50mb' })); // Increased limit for large file uploads (base64)

// Serve static files from the current directory (HTML, CSS, Client JS)
app.use(express.static(path.join(__dirname)));

// --- API Proxy Endpoint ---
app.post('/api/generatePrompt', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server error: GEMINI_API_KEY is not configured in the .env file." });
    }

    try {
        const clientPayload = req.body;

        // NOTE: fetch is now the native Node.js global function (since v18)
        const API_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // Forward the request to the Gemini API
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(clientPayload),
        });

        // The response must be parsed correctly depending on its content type
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Handle non-JSON errors (like HTML 404 or plain text errors)
            const text = await response.text();
            data = { error: { message: text } };
        }


        if (!response.ok) {
            console.error("Gemini API Error:", data.error?.message || response.statusText);
            // Pass the error back to the client
            return res.status(response.status).json(data);
        }

        // Send the successful response back to the client
        res.json(data);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`\n\n✅ Server is running securely on http://localhost:${PORT}`);
    console.log(`Your API key is securely loaded from the .env file.`);
});