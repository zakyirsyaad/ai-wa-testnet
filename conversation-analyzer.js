const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");

class ConversationAnalyzer {
  constructor() {
    this.openai = openai;
  }

  // Analyze user response to detect agreement/consent
  async analyzeUserConsent(userMessage, context = "") {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        maxTokens: 100,
        system: `You are an AI that analyzes user responses to detect agreement, consent, or positive responses.
        
        Analyze the user's message and respond with ONLY one of these categories:
        - "AGREE" - if user agrees, consents, or gives positive response
        - "DISAGREE" - if user disagrees, refuses, or gives negative response  
        - "NEUTRAL" - if response is unclear or neutral
        
        Context: ${context}
        
        Respond with only the category, nothing else.`,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      return result.text.trim().toUpperCase();
    } catch (error) {
      console.error("Error analyzing user consent:", error);
      return "NEUTRAL"; // Default to neutral if analysis fails
    }
  }

  // Analyze conversation sentiment
  async analyzeSentiment(userMessage) {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        maxTokens: 50,
        system: `Analyze the sentiment of the user message and respond with ONLY:
        - "POSITIVE" - happy, satisfied, enthusiastic
        - "NEGATIVE" - angry, frustrated, dissatisfied
        - "NEUTRAL" - neutral, factual, unclear
        
        Respond with only the sentiment, nothing else.`,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      return result.text.trim().toUpperCase();
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      return "NEUTRAL";
    }
  }

  // Detect if user wants to proceed with training
  async detectTrainingIntent(userMessage) {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        maxTokens: 50,
        system: `Analyze if the user wants to proceed with AI training and respond with ONLY:
        - "YES" - user wants to train, improve, or proceed with training
        - "NO" - user doesn't want to train or is satisfied with current state
        - "MAYBE" - unclear or conditional response
        
        Respond with only YES/NO/MAYBE, nothing else.`,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      return result.text.trim().toUpperCase();
    } catch (error) {
      console.error("Error detecting training intent:", error);
      return "MAYBE";
    }
  }

  // Analyze conversation quality for training
  async analyzeConversationQuality(conversationHistory) {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        maxTokens: 100,
        system: `Analyze the quality of this conversation for AI training and respond with:
        - "HIGH" - good quality, diverse topics, clear responses
        - "MEDIUM" - decent quality, some useful data
        - "LOW" - poor quality, repetitive, unclear
        
        Consider: topic diversity, response clarity, conversation depth, and training value.
        
        Respond with only the quality level, nothing else.`,
        messages: [
          {
            role: "user",
            content: `Analyze this conversation:\n${conversationHistory
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join("\n")}`,
          },
        ],
      });

      return result.text.trim().toUpperCase();
    } catch (error) {
      console.error("Error analyzing conversation quality:", error);
      return "MEDIUM";
    }
  }

  // Detect user's preferred communication style
  async detectCommunicationStyle(conversationHistory) {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        maxTokens: 50,
        system: `Analyze the user's communication style and respond with ONLY:
        - "FORMAL" - professional, polite, structured
        - "CASUAL" - friendly, relaxed, informal
        - "DIRECT" - brief, to-the-point, concise
        - "DETAILED" - thorough, explanatory, verbose
        
        Respond with only the style, nothing else.`,
        messages: [
          {
            role: "user",
            content: `Analyze communication style:\n${conversationHistory
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join("\n")}`,
          },
        ],
      });

      return result.text.trim().toUpperCase();
    } catch (error) {
      console.error("Error detecting communication style:", error);
      return "CASUAL";
    }
  }

  // Check if conversation should trigger training
  async shouldTriggerTraining(conversationHistory, lastTrainingDate) {
    try {
      const quality = await this.analyzeConversationQuality(
        conversationHistory
      );
      const style = await this.detectCommunicationStyle(conversationHistory);

      // Check if enough time has passed since last training
      const daysSinceLastTraining = lastTrainingDate
        ? (new Date() - new Date(lastTrainingDate)) / (1000 * 60 * 60 * 24)
        : 999;

      // Trigger training if:
      // 1. High quality conversation
      // 2. Sufficient data (at least 10 messages)
      // 3. Enough time has passed (7+ days)
      // 4. Good communication style detected

      const hasEnoughData = conversationHistory.length >= 10;
      const enoughTimePassed = daysSinceLastTraining >= 7;
      const goodQuality = quality === "HIGH" || quality === "MEDIUM";
      const goodStyle = style !== "DIRECT"; // Avoid training on very brief responses

      return hasEnoughData && enoughTimePassed && goodQuality && goodStyle;
    } catch (error) {
      console.error("Error checking training trigger:", error);
      return false;
    }
  }
}

module.exports = ConversationAnalyzer;
