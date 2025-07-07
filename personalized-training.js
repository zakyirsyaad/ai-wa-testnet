const { createClient } = require("@supabase/supabase-js");
const { openai } = require("@ai-sdk/openai");
const dotenv = require("dotenv");

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class PersonalizedTraining {
  constructor() {
    this.openai = openai;
  }

  // Mengumpulkan data training dari user
  async collectUserTrainingData(userId) {
    try {
      // Ambil chat history
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("chat_history, conversation_state")
        .eq("id", userId)
        .single();

      if (userError)
        throw new Error(`Error fetching user: ${userError.message}`);

      return {
        chatHistory: user.chat_history || [],
        conversationState: user.conversation_state,
      };
    } catch (error) {
      console.error("Error collecting training data:", error);
      throw error;
    }
  }

  // Membuat training data untuk fine-tuning
  async createTrainingDataset(userId) {
    const userData = await this.collectUserTrainingData(userId);

    // Get user's AI preference
    const UserPreferences = require("./user-preferences");
    const userPrefs = new UserPreferences();
    const userPref = await userPrefs.getUserAIPreference(userId);
    const aiType = userPref?.ai_type || "health-coach";

    const trainingExamples = [];

    // Convert chat history to training format
    if (userData.chatHistory.length > 0) {
      for (let i = 0; i < userData.chatHistory.length - 1; i += 2) {
        if (userData.chatHistory[i] && userData.chatHistory[i + 1]) {
          const systemPrompt = await this.createPersonalizedSystemPrompt(
            userData,
            aiType
          );
          trainingExamples.push({
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              { role: "user", content: userData.chatHistory[i].content },
              {
                role: "assistant",
                content: userData.chatHistory[i + 1].content,
              },
            ],
          });
        }
      }
    }

    return trainingExamples;
  }

  // Membuat system prompt yang personalized
  async createPersonalizedSystemPrompt(userData, aiType = null) {
    const chatHistory = userData.chatHistory || [];
    const totalConversations = chatHistory.length;

    let basePrompt = `Anda adalah asisten AI personal yang memahami pola percakapan pengguna. 
    
    Total percakapan: ${totalConversations}
    
    Berikan saran yang personal berdasarkan riwayat percakapan pengguna. 
    Gunakan bahasa yang familiar dan sesuai dengan gaya komunikasi pengguna.`;

    // Add AI type specific prompt if provided
    if (aiType) {
      const UserPreferences = require("./user-preferences");
      const userPrefs = new UserPreferences();
      const aiDetails = userPrefs.getAITypeDetails(aiType);

      if (aiDetails) {
        basePrompt = `${aiDetails.systemPrompt}\n\n${basePrompt}`;
      }
    }

    return basePrompt;
  }

  // Fine-tuning dengan OpenAI
  async createFineTunedModel(userId, trainingData) {
    try {
      // Upload training data ke OpenAI
      const trainingFile = await this.openai.files.create({
        file: Buffer.from(JSON.stringify(trainingData)),
        purpose: "fine-tune",
      });

      // Create fine-tuning job
      const fineTuneJob = await this.openai.fineTuning.jobs.create({
        training_file: trainingFile.id,
        model: "gpt-3.5-turbo",
        suffix: `personal-${userId}`,
      });

      return fineTuneJob.id;
    } catch (error) {
      console.error("Error creating fine-tuned model:", error);
      throw error;
    }
  }

  // Check fine-tuning status
  async checkFineTuningStatus(jobId) {
    try {
      const job = await this.openai.fineTuning.jobs.retrieve(jobId);
      return {
        status: job.status,
        modelId: job.fine_tuned_model,
        progress: job.trained_tokens,
      };
    } catch (error) {
      console.error("Error checking fine-tuning status:", error);
      throw error;
    }
  }

  // Save personalized model info to database
  async savePersonalizedModel(userId, modelId, jobId) {
    try {
      await supabase
        .from("users")
        .update({
          personalized_model_id: modelId,
          fine_tune_job_id: jobId,
          last_training_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } catch (error) {
      console.error("Error saving personalized model:", error);
      throw error;
    }
  }
}

module.exports = PersonalizedTraining;
