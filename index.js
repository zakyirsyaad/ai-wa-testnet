const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const PersonalizedTraining = require("./personalized-training");
const TrainingScheduler = require("./training-scheduler");
const UserPreferences = require("./user-preferences");
const ConversationAnalyzer = require("./conversation-analyzer");

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

// Initialize personalized training
const personalizedTraining = new PersonalizedTraining();
const trainingScheduler = new TrainingScheduler();
const userPreferences = new UserPreferences();
const conversationAnalyzer = new ConversationAnalyzer();

// In-memory store for the last active image per user
const activeImages = {};

app.use(express.json());

const openAiCompletion = async (
  messageHistory,
  modelName = "gpt-4o",
  systemPrompt = null
) => {
  try {
    const result = await generateText({
      model: openai(modelName),
      maxTokens: 1024,
      system:
        systemPrompt ||
        "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. You remember the context of the conversation, including the last image sent. You were created by Zaky Iryad Rais.",
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

// Main message handler
client.on("message_create", async (message) => {
  const messageBody = (message.body || "").trim();
  const chatId = message.from;

  try {
    // Fetch user and their state first
    let { data: user, error: userError } = await supabase
      .from("users")
      .select("id, chat_history, conversation_state")
      .eq("id", chatId)
      .single();

    // Create user if they don't exist
    if (userError && userError.code === "PGRST116") {
      const { data: newUser, error: newUserError } = await supabase
        .from("users")
        .insert([{ id: chatId, chat_history: [] }])
        .select("id, chat_history, conversation_state")
        .single();
      if (newUserError)
        throw new Error(`Error creating user: ${newUserError.message}`);
      user = newUser;
      console.log(`New user created: ${user.id}`);
    } else if (userError) {
      throw new Error(`Error fetching user: ${userError.message}`);
    }

    // --- Normal message processing ---
    if (messageBody.toLowerCase().startsWith("jek, train")) {
      await handlePersonalizedTraining(message, user);
    } else if (messageBody.toLowerCase().startsWith("jek, pilih ai")) {
      await handleAISelection(message, user);
    } else if (messageBody.toLowerCase().startsWith("jek, ai saya")) {
      await handleAIConfiguration(message, user);
    } else if (messageBody.toLowerCase().startsWith("jek")) {
      await handleAiChat(message, user);
    }

    // --- Post-chat analysis for training triggers ---
    await analyzeAndTriggerTraining(message, user);
  } catch (error) {
    console.error("An error occurred:", error.message);
    await client.sendMessage(
      chatId,
      "Maaf, terjadi kesalahan. Silakan coba lagi."
    );
  }
});

// --- State-specific handlers ---

async function handleAISelection(message, user) {
  const chatId = user.id;
  const messageBody = message.body.trim();

  try {
    // Extract AI type from command
    const aiType = messageBody.substring("jek, pilih ai".length).trim();

    if (!aiType) {
      // Show available AI types
      const availableAIs = userPreferences.getAvailableAITypes();
      let response = "🤖 *Pilih AI Assistant Anda:*\n\n";

      Object.entries(availableAIs).forEach(([key, ai]) => {
        response += `*${ai.name}*\n`;
        response += `${ai.description}\n`;
        response += `Contoh: "jek, pilih ai ${key}"\n\n`;
      });

      response +=
        "Ketik: jek, pilih ai [tipe] untuk memilih AI assistant Anda.";
      await client.sendMessage(chatId, response);
      return;
    }

    // Set user's AI preference
    const result = await userPreferences.setUserAIPreference(chatId, aiType);

    if (result.success) {
      const aiDetails = result.aiDetails;
      const examples = userPreferences.getExamplePrompts(aiType);

      let response = `✅ *AI Assistant berhasil dipilih!*\n\n`;
      response += `*${aiDetails.name}*\n`;
      response += `${aiDetails.description}\n\n`;
      response += `*Contoh pertanyaan:*\n`;
      examples.forEach((example, index) => {
        response += `${index + 1}. ${example}\n`;
      });

      response += `\nSekarang Anda bisa chat dengan AI ${aiDetails.name} yang personal!`;

      await client.sendMessage(chatId, response);
    }
  } catch (error) {
    console.error("Error in AI selection:", error);
    await client.sendMessage(
      chatId,
      "❌ Terjadi kesalahan. Pastikan tipe AI yang Anda pilih tersedia."
    );
  }
}

async function handleAIConfiguration(message, user) {
  const chatId = user.id;

  try {
    const userPref = await userPreferences.getUserAIPreference(chatId);

    if (!userPref) {
      await client.sendMessage(
        chatId,
        "❌ Anda belum memilih AI assistant. Ketik 'jek, pilih ai' untuk melihat pilihan."
      );
      return;
    }

    let response = `🤖 *AI Assistant Anda:*\n\n`;
    response += `*Nama:* ${userPref.ai_name}\n`;
    response += `*Deskripsi:* ${userPref.ai_description}\n`;
    response += `*Focus Areas:* ${
      userPref.focus_areas?.join(", ") || "Belum diatur"
    }\n`;
    response += `*Gaya Komunikasi:* ${
      userPref.communication_style || "Formal"
    }\n`;
    response += `*Bahasa:* ${userPref.preferred_language || "Indonesia"}\n\n`;

    response += `*Untuk mengubah AI:* jek, pilih ai [tipe]\n`;
    response += `*Untuk training personal:* jek, train`;

    await client.sendMessage(chatId, response);
  } catch (error) {
    console.error("Error in AI configuration:", error);
    await client.sendMessage(
      chatId,
      "❌ Terjadi kesalahan saat mengambil konfigurasi AI."
    );
  }
}

async function handlePersonalizedTraining(message, user) {
  const chatId = user.id;

  try {
    await client.sendMessage(
      chatId,
      "🔄 Memulai proses personalized training..."
    );

    // Check if user has enough conversation data
    const chatHistory = user.chat_history || [];
    const totalDataPoints = chatHistory.length;

    if (totalDataPoints < 10) {
      await client.sendMessage(
        chatId,
        `⚠️ Anda memerlukan minimal 10 percakapan untuk personalized training. 
        Saat ini: ${totalDataPoints} percakapan.
        
        Lanjutkan chat dengan AI untuk mengumpulkan data.`
      );
      return;
    }

    // Create training dataset
    const trainingData = await personalizedTraining.createTrainingDataset(
      chatId
    );

    if (trainingData.length === 0) {
      await client.sendMessage(
        chatId,
        "❌ Tidak ada data training yang cukup."
      );
      return;
    }

    // Start fine-tuning
    const jobId = await personalizedTraining.createFineTunedModel(
      chatId,
      trainingData
    );

    // Save to database
    await supabase
      .from("users")
      .update({
        fine_tune_job_id: jobId,
        is_training: true,
        training_data_size: totalDataPoints,
      })
      .eq("id", chatId);

    await client.sendMessage(
      chatId,
      `✅ Training dimulai! Job ID: ${jobId}
      
      Proses ini memakan waktu 1-2 jam. Saya akan memberitahu Anda ketika selesai.
      
      Data training: ${trainingData.length} examples`
    );
  } catch (error) {
    console.error("Error in personalized training:", error);
    await client.sendMessage(
      chatId,
      "❌ Terjadi kesalahan dalam proses training. Silakan coba lagi nanti."
    );
  }
}

async function handleAiChat(message, user) {
  const messageBody = message.body.trim();
  const chatId = user.id;
  const hasMedia = message.hasMedia;

  const dbHistory = user.chat_history || [];
  const formattedHistory = dbHistory.map((msg) => ({
    role: msg.role,
    content: [{ type: "text", text: msg.content }],
  }));

  const newUserMessageParts = [];
  let userMessageForDb = { role: "user", content: messageBody };

  if (hasMedia) {
    const media = await message.downloadMedia();
    if (media && media.mimetype.startsWith("image/")) {
      const imageBuffer = Buffer.from(media.data, "base64");
      activeImages[chatId] = imageBuffer;
      newUserMessageParts.push({ type: "image", image: imageBuffer });
      userMessageForDb.content = `${messageBody} [Image Sent]`;
    }
  } else if (activeImages[chatId]) {
    newUserMessageParts.push({ type: "image", image: activeImages[chatId] });
  }

  newUserMessageParts.push({ type: "text", text: messageBody });

  // Get user's AI preference and create personalized system prompt
  const userPref = await userPreferences.getUserAIPreference(chatId);
  let systemPrompt =
    "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. You remember the context of the conversation, including the last image sent. You were created by Zaky Iryad Rais.";

  if (userPref && userPref.ai_type) {
    systemPrompt = await userPreferences.createPersonalizedSystemPrompt(
      chatId,
      userPref.ai_type
    );
    console.log(`Using personalized AI: ${userPref.ai_name}`);
  }

  // Use personalized model if available
  let modelToUse = "gpt-4o";
  if (user.personalized_model_id) {
    modelToUse = user.personalized_model_id;
    console.log(`Using personalized model: ${modelToUse}`);
  }

  const aiMessages = [
    ...formattedHistory,
    { role: "user", content: newUserMessageParts },
  ];
  const response = await openAiCompletion(aiMessages, modelToUse, systemPrompt);

  if (response) {
    if (!hasMedia && messageBody.toLowerCase().includes("lupakan gambar")) {
      delete activeImages[chatId];
      console.log(`Active image for ${chatId} has been forgotten.`);
    }

    const newDbHistory = [
      ...dbHistory,
      userMessageForDb,
      { role: "assistant", content: response },
    ];

    await supabase
      .from("users")
      .update({
        chat_history: newDbHistory,
        conversation_state: user.conversation_state,
      })
      .eq("id", user.id);

    await client.sendMessage(chatId, response);
  }
}

async function analyzeAndTriggerTraining(message, user) {
  const chatId = user.id;
  const messageBody = message.body.trim();

  try {
    // Skip analysis for commands
    if (messageBody.toLowerCase().startsWith("jek, ")) {
      return;
    }

    // Analyze user consent for any training-related questions
    const consent = await conversationAnalyzer.analyzeUserConsent(messageBody);

    if (consent === "AGREE") {
      // Check if we should suggest training
      const chatHistory = user.chat_history || [];
      const shouldTrain = await conversationAnalyzer.shouldTriggerTraining(
        chatHistory,
        user.last_training_at
      );

      if (shouldTrain) {
        await client.sendMessage(
          chatId,
          "🤖 Saya melihat percakapan kita sudah cukup banyak dan berkualitas. Apakah Anda ingin saya melakukan personalized training untuk memberikan respons yang lebih baik?"
        );
      }
    }

    // Analyze conversation quality and update user preferences
    const chatHistory = user.chat_history || [];
    if (chatHistory.length > 5) {
      const style = await conversationAnalyzer.detectCommunicationStyle(
        chatHistory
      );
      const sentiment = await conversationAnalyzer.analyzeSentiment(
        messageBody
      );

      // Update user preferences based on analysis
      await userPreferences.updateCommunicationPreferences(chatId, {
        communication_style: style.toLowerCase(),
        preferred_language: "id", // Default to Indonesian
      });
    }
  } catch (error) {
    console.error("Error in conversation analysis:", error);
    // Don't send error message to user, just log it
  }
}

// Start the client
client.initialize();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Start training scheduler
  trainingScheduler.start();
});
