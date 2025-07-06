const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { streamText, generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const dotenv = require("dotenv");

dotenv.config();

// import { CoreMessage, streamText } from "ai";
// import dotenv from "dotenv";
// import * as readline from "node:readline/promises";

// import { generateText } from "ai";
// import { openai } from "@ai-sdk/openai";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Streaming Text with Chat Prompt
const openAiCompletion = async (messageUser) => {
  try {
    const result = await generateText({
      model: openai("gpt-4o"),
      maxTokens: 1024,
      tools: {
        web_search_preview: openai.tools.webSearchPreview(),
      },
      system:
        "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. created or builded by Zaky Iryad Rais",
      messages: [
        {
          role: "user",
          content: messageUser,
        },
      ],
    });
    return result.text;
  } catch (error) {
    console.error("Error in AI completion:", error.message || "Unknown error");
    return "Sorry, I encountered an error while processing your request.";
  }
};

// Create a new client instance
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "testnet-ai-wa" }),
});

// When the client is ready, run this code (only once)
client.once("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("message_create", async (message) => {
  // Check if message.body exists and is a string
  if (!message.body || typeof message.body !== "string") {
    return;
  }

  const messageBody = message.body.trim().toLowerCase();
  if (messageBody.startsWith("jek")) {
    console.log("Processing message:", messageBody);
    const response = await openAiCompletion(messageBody);
    if (response) {
      await client.sendMessage(message.from, response);
    }
  }
});

// Start your client
client.initialize();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
