const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and Anon Key must be provided in .env file");
}
const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory store for the last active image per user
const activeImages = {};

app.use(express.json());

const openAiCompletion = async (messageHistory) => {
  try {
    const result = await generateText({
      model: openai("gpt-4o"),
      maxTokens: 1024,
      system: "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. You remember the context of the conversation, including the last image sent. You were created by Zaky Iryad Rais.",
      messages: messageHistory,
    });
    return result.text;
  } catch (error) {
    console.error("Error in AI completion:", error.message || "Unknown error");
    return "Sorry, I encountered an error while processing your request.";
  }
};

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "testnet-ai-wa" }),
  puppeteer: {
    args: ["--no-sandbox"],
  },
});

client.once("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("message_create", async (message) => {
  const messageBody = (message.body || "").trim();
  const chatId = message.from;
  const hasMedia = message.hasMedia;

  if (!messageBody.toLowerCase().startsWith("jek")) {
    return;
  }

  console.log(`Processing message from ${chatId}:`, messageBody);

  try {
    // 1. Find or create the user
    let { data: user, error: userError } = await supabase.from("users").select("id, chat_history").eq("id", chatId).single();

    if (userError && userError.code !== "PGRST116") {
      throw new Error(`Error fetching user: ${userError.message}`);
    }

    if (!user) {
      const { data: newUser, error: newUserError } = await supabase
        .from("users")
        .insert([{ id: chatId, chat_history: [] }])
        .select("id, chat_history")
        .single();
      if (newUserError) {
        throw new Error(`Error creating user: ${newUserError.message}`);
      }
      user = newUser;
      console.log(`New user created: ${user.id}`);
    }

    // 2. Prepare the content for the AI
    const dbHistory = user.chat_history || [];
    const formattedHistory = dbHistory.map((msg) => ({
      role: msg.role,
      content: [{ type: "text", text: msg.content }],
    }));

    const newUserMessageParts = [];
    let userMessageForDb = { role: "user", content: messageBody };

    // **THE FIX**: Ensure image part comes first if it exists
    if (hasMedia) {
      console.log("Message has media, downloading...");
      const media = await message.downloadMedia();
      if (media && media.mimetype.startsWith("image/")) {
        const imageBuffer = Buffer.from(media.data, "base64");
        activeImages[chatId] = imageBuffer; // Store in active memory
        newUserMessageParts.push({ type: "image", image: imageBuffer });
        userMessageForDb.content = `${messageBody} [Image Sent]`;
      }
    } else if (activeImages[chatId]) {
      console.log(`Attaching active image for user ${chatId}`);
      newUserMessageParts.push({ type: "image", image: activeImages[chatId] });
    }

    // Always add the text part after the potential image part
    newUserMessageParts.push({ type: "text", text: messageBody });

    const aiMessages = [...formattedHistory, { role: "user", content: newUserMessageParts }];

    // 3. Get the response from AI
    const response = await openAiCompletion(aiMessages);

    if (response) {
      // Clear active image if user starts a new topic without an image
      if (!hasMedia && messageBody.toLowerCase().includes("lupakan gambar")) {
        delete activeImages[chatId];
        console.log(`Active image for ${chatId} has been forgotten.`);
      }

      // 4. Prepare the new history for the database
      const newDbHistory = [...dbHistory, userMessageForDb, { role: "assistant", content: response }];

      // 5. Update the user's chat_history in the database
      const { error: updateError } = await supabase.from("users").update({ chat_history: newDbHistory }).eq("id", user.id);

      if (updateError) {
        throw new Error(`Error updating chat history: ${updateError.message}`);
      }

      // 6. Send the response to the user
      await client.sendMessage(chatId, response);
    }
  } catch (error) {
    console.error("An error occurred:", error.message);
    await client.sendMessage(chatId, "Sorry, an error occurred. Please try again later.");
  }
});

client.initialize();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
