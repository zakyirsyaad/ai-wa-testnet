const { createClient } = require("@supabase/supabase-js");
const PersonalizedTraining = require("./personalized-training");
const dotenv = require("dotenv");

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const personalizedTraining = new PersonalizedTraining();

class TrainingScheduler {
  constructor() {
    this.isRunning = false;
  }

  // Check training status for all users
  async checkTrainingStatus() {
    try {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, fine_tune_job_id, is_training, last_training_at")
        .eq("is_training", true);

      if (error) throw new Error(`Error fetching users: ${error.message}`);

      for (const user of users) {
        if (user.fine_tune_job_id) {
          const status = await personalizedTraining.checkFineTuningStatus(
            user.fine_tune_job_id
          );

          if (status.status === "succeeded") {
            await this.completeTraining(user.id, status.modelId);
          } else if (status.status === "failed") {
            await this.handleTrainingFailure(user.id);
          }
        }
      }
    } catch (error) {
      console.error("Error checking training status:", error);
    }
  }

  // Complete training process
  async completeTraining(userId, modelId) {
    try {
      await supabase
        .from("users")
        .update({
          personalized_model_id: modelId,
          is_training: false,
          last_training_at: new Date().toISOString(),
        })
        .eq("id", userId);

      console.log(
        `✅ Training completed for user ${userId}. Model: ${modelId}`
      );
    } catch (error) {
      console.error("Error completing training:", error);
    }
  }

  // Handle training failure
  async handleTrainingFailure(userId) {
    try {
      await supabase
        .from("users")
        .update({
          is_training: false,
          fine_tune_job_id: null,
        })
        .eq("id", userId);

      console.log(`❌ Training failed for user ${userId}`);
    } catch (error) {
      console.error("Error handling training failure:", error);
    }
  }

  // Auto-trigger training for eligible users
  async autoTriggerTraining() {
    try {
      const { data: users, error } = await supabase.from("users").select(`
          id, 
          chat_history, 
          last_training_at,
          training_data_size,
          is_training
        `);

      if (error) throw new Error(`Error fetching users: ${error.message}`);

      for (const user of users) {
        if (user.is_training) continue;

        const shouldTrain = await this.shouldTriggerTraining(user);
        if (shouldTrain) {
          await this.triggerTraining(user.id);
        }
      }
    } catch (error) {
      console.error("Error in auto-trigger training:", error);
    }
  }

  // Check if training should be triggered
  async shouldTriggerTraining(user) {
    const chatHistory = user.chat_history || [];
    const lastTraining = user.last_training_at
      ? new Date(user.last_training_at)
      : null;
    const now = new Date();

    const totalDataPoints = chatHistory.length;

    // Minimum data requirement
    if (totalDataPoints < 10) return false;

    // Check time since last training
    if (lastTraining) {
      const daysSinceLastTraining =
        (now - lastTraining) / (1000 * 60 * 60 * 24);
      if (daysSinceLastTraining < 7) return false; // Weekly training
    }

    // Check if there's new data
    const newDataThreshold = 5; // At least 5 new conversations
    const lastTrainingDataSize = user.training_data_size || 0;
    const newDataPoints = totalDataPoints - lastTrainingDataSize;

    return newDataPoints >= newDataThreshold;
  }

  // Trigger training for a specific user
  async triggerTraining(userId) {
    try {
      console.log(`🔄 Auto-triggering training for user ${userId}`);

      const trainingData = await personalizedTraining.createTrainingDataset(
        userId
      );

      if (trainingData.length === 0) {
        console.log(`No training data available for user ${userId}`);
        return;
      }

      const jobId = await personalizedTraining.createFineTunedModel(
        userId,
        trainingData
      );

      await supabase
        .from("users")
        .update({
          fine_tune_job_id: jobId,
          is_training: true,
          training_data_size: trainingData.length,
        })
        .eq("id", userId);

      console.log(
        `✅ Auto-training started for user ${userId}. Job ID: ${jobId}`
      );
    } catch (error) {
      console.error(`Error triggering training for user ${userId}:`, error);
    }
  }

  // Start scheduler
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("🚀 Training scheduler started");

    // Check training status every 30 minutes
    setInterval(() => {
      this.checkTrainingStatus();
    }, 30 * 60 * 1000);

    // Auto-trigger training every 6 hours
    setInterval(() => {
      this.autoTriggerTraining();
    }, 6 * 60 * 60 * 1000);

    // Initial checks
    this.checkTrainingStatus();
    this.autoTriggerTraining();
  }

  // Stop scheduler
  stop() {
    this.isRunning = false;
    console.log("⏹️ Training scheduler stopped");
  }
}

module.exports = TrainingScheduler;
