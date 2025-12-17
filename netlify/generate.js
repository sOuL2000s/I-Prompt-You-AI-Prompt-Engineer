// netlify/generate.js
const fetch = require('node-fetch'); // NOTE: Using standard fetch might work, but node-fetch is safer in older Netlify function runtimes. We will rely on built-in Node 18+ fetch if available.
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

// Main handler for the serverless function
exports.handler = async (event, context) => {
    // 1. Check for API Key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server error: API key is not configured in Netlify environment variables." }),
        };
    }

    // 2. Ensure request is POST and has a body
    if (event.httpMethod !== 'POST' || !event.body) {
        return {
            statusCode: 405,
            body: "Method Not Allowed or Missing Body",
        };
    }

    try {
        const clientPayload = JSON.parse(event.body);

        const API_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // 3. Forward the request to the Gemini API
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(clientPayload),
        });

        const data = await response.json();

        // 4. Return the response to the client
        return {
            statusCode: response.status,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        };

    } catch (error) {
        console.error('Function Proxy Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal Serverless Error: ${error.message}` }),
        };
    }
};