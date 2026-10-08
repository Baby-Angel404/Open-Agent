import * as crypto from "node:crypto";
import { ReputationRecord, ReputationEvent, ReputationEventType } from "../types/index.js";

export class ReputationManager {
  private records: Map<string, ReputationRecord> = new Map();
  private events: ReputationEvent[] = [];

  private static readonly DEFAULT_DELTAS: Record<ReputationEventType, number> = {
    SUCCESSFUL_REQUEST: 2.0,
    FAILED_REQUEST: -5.0,
    TIMEOUT: -8.0,
    INVALID_SIGNATURE: -20.0,
    POLICY_VIOLATION: -25.0,
    MALFORMED_MESSAGE: -10.0,
    REPLAY_ATTEMPT: -30.0,
    USER_REPORT: -15.0,
  };

  getRecord(agentId: string): ReputationRecord {
    const existing = this.records.get(agentId);
    if (existing) {
      return { ...existing };
    }

    const initial: ReputationRecord = {
      agent_id: agentId,
      successful_requests: 0,
      failed_requests: 0,
      timeouts: 0,
      policy_violations: 0,
      invalid_messages: 0,
      user_reports: 0,
      score: 50.0, // Neutral starting reputation
      updated_at: new Date().toISOString(),
    };
    this.records.set(agentId, initial);
    return { ...initial };
  }

  recordEvent(params: {
    agent_id: string;
    event_type: ReputationEventType;
    request_id?: string;
    evidence_reference: string;
    customDelta?: number;
  }): ReputationEvent {
    const record = this.records.get(params.agent_id) || {
      agent_id: params.agent_id,
      successful_requests: 0,
      failed_requests: 0,
      timeouts: 0,
      policy_violations: 0,
      invalid_messages: 0,
      user_reports: 0,
      score: 50.0,
      updated_at: new Date().toISOString(),
    };

    const delta = params.customDelta ?? ReputationManager.DEFAULT_DELTAS[params.event_type] ?? 0;

    switch (params.event_type) {
      case "SUCCESSFUL_REQUEST":
        record.successful_requests++;
        break;
      case "FAILED_REQUEST":
        record.failed_requests++;
        break;
      case "TIMEOUT":
        record.timeouts++;
        break;
      case "POLICY_VIOLATION":
        record.policy_violations++;
        break;
      case "INVALID_SIGNATURE":
      case "MALFORMED_MESSAGE":
      case "REPLAY_ATTEMPT":
        record.invalid_messages++;
        break;
      case "USER_REPORT":
        record.user_reports++;
        break;
    }

    record.score = Math.max(0.0, Math.min(100.0, record.score + delta));
    record.updated_at = new Date().toISOString();
    this.records.set(params.agent_id, record);

    const event: ReputationEvent = {
      event_id: `rep_evt_${crypto.randomUUID()}`,
      agent_id: params.agent_id,
      event_type: params.event_type,
      request_id: params.request_id,
      timestamp: new Date().toISOString(),
      evidence_reference: params.evidence_reference,
      score_delta: delta,
    };

    this.events.push(event);
    return event;
  }

  listRecords(): ReputationRecord[] {
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  getEvents(agentId?: string): ReputationEvent[] {
    if (!agentId) return [...this.events];
    return this.events.filter((e) => e.agent_id === agentId);
  }
}
