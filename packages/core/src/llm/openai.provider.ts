import { AgentAction } from "../types/action.js";
import { LLMProvider, ActionProposalContext } from "../types/llm.js";

export interface OpenAICompatibleConfig {
  baseUrl?: string; // e.g. "http://localhost:11434/v1" (Ollama) or local server
  apiKey?: string;
  modelName?: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = "provider.openai_compatible";
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private modelName: string;

  constructor(config?: OpenAICompatibleConfig) {
    this.baseUrl = config?.baseUrl || "http://localhost:11434/v1";
    this.apiKey = config?.apiKey || "not-needed-for-local";
    this.modelName = config?.modelName || "llama3.2";
    this.name = `OpenAI-Compatible Provider (${this.modelName})`;
  }

  async proposeAction(context: ActionProposalContext): Promise<AgentAction | null> {
    const systemPrompt = `You are an autonomous AI agent. Propose the next single atomic action to progress toward the user task.
Available capabilities: ${JSON.stringify(context.availableCapabilities.map((c) => c.actionType))}
Output JSON format only:
{
  "type": "<action_type>",
  "target": "<target_resource_or_url>",
  "parameters": {}
}
If the task is complete, reply with null or empty JSON.`;

    const body = {
      model: this.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Task: ${context.task}` },
      ],
      temperature: 0.1,
    };

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`LLM API returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content || content === "null") return null;

      const parsed = JSON.parse(content) as {
        type?: string;
        target?: string;
        parameters?: Record<string, unknown>;
      };
      if (!parsed.type) return null;

      return {
        id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sessionId: context.session.id,
        type: parsed.type,
        target: parsed.target || "",
        parameters: parsed.parameters || {},
        timestamp: new Date().toISOString(),
        agentId: context.session.agentId,
      };
    } catch {
      // In local mode without live running LLM daemon, fail gracefully
      return null;
    }
  }
}
