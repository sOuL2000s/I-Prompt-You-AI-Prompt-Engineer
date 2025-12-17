// netlify/generate.js (Using Native Fetch)

// REMOVED: const fetch = require('node-fetch'); 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

// Main handler for the serverless function
exports.handler = async (event, context) => {
    // 1. Check for API Key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        // Log the environment error for Netlify logs
        console.error("GEMINI_API_KEY environment variable is missing."); 
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: API key not found." }),
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
        const API_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // 3. Forward the request to the Gemini API using native fetch
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: event.body, // Pass the raw JSON string received from the client
        });

        // 4. Handle API failure states
        const data = await response.json();

        if (!response.ok) {
            // Log the specific Google API error
            console.error("External API Error:", response.status, data.error?.message);
            
            return {
                statusCode: response.status,
                headers: { "Content-Type": "application/json" },
                // Return the error message from Google's API to the client
                body: JSON.stringify({ error: data.error?.message || `Google API returned status ${response.status}` }),
            };
        }

        // 5. Send the successful response back to the client
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        };

    } catch (error) {
        // Log the specific error that caused the 500
        console.error('Function Proxy Fatal Error:', error.message, error.stack); 
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal Server Error: Failed to execute function. Check Netlify logs.` }),
        };
    }
};