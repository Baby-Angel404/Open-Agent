import * as crypto from "node:crypto";
import {
  CapabilityRequest,
  CapabilityResponse,
  AgentKeyPair,
  DataClassification,
} from "../types/index.js";
import { PolicyEngine, Policy, AppendOnlyAuditStore } from "@open-agent/core";
import { IdentityManager } from "../identity/identity-manager.js";
import { MessageAuthenticator } from "../protocol/authenticator.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { PeerManager } from "../discovery/peer-manager.js";
import { ResourceGuard } from "../guards/resource-guard.js";
import { ReputationManager } from "../reputation/reputation-manager.js";
import { ITransport } from "../transport/transport.js";

export type CapabilityExecutorFn = (
  input: Record<string, unknown>,
  callerAgentId: string
) => Promise<{ output: unknown; evidence?: any[] }>;

export class CapabilityInvocationHandler {
  private keyPair: AgentKeyPair;
  private policy: Policy;
  private policyEngine: PolicyEngine;
  private registry: CapabilityRegistry;
  private peerManager: PeerManager;
  private reputationManager: ReputationManager;
  private resourceGuard: ResourceGuard;
  private transport: ITransport;
  private auditStore?: AppendOnlyAuditStore;
  private executors: Map<string, CapabilityExecutorFn> = new Map();

  constructor(options: {
    keyPair: AgentKeyPair;
    policy: Policy;
    policyEngine?: PolicyEngine;
    registry: CapabilityRegistry;
    peerManager: PeerManager;
    reputationManager?: ReputationManager;
    resourceGuard?: ResourceGuard;
    transport: ITransport;
    auditStore?: AppendOnlyAuditStore;
  }) {
    this.keyPair = options.keyPair;
    this.policy = options.policy;
    this.policyEngine = options.policyEngine || new PolicyEngine();
    this.registry = options.registry;
    this.peerManager = options.peerManager;
    this.reputationManager = options.reputationManager || new ReputationManager();
    this.resourceGuard = options.resourceGuard || new ResourceGuard();
    this.transport = options.transport;
    this.auditStore = options.auditStore;
  }

  registerExecutor(capabilityId: string, fn: CapabilityExecutorFn): void {
    this.executors.set(capabilityId, fn);
  }

  /**
   * Client-side: Invokes a capability on a remote peer with strict local policy enforcement.
   */
  async invokeRemoteCapability(params: {
    targetAgentId: string;
    capabilityId: string;
    capabilityVersion?: string;
    input: Record<string, unknown>;
    dataClassification?: DataClassification;
    timeoutMs?: number;
  }): Promise<CapabilityResponse> {
    const targetPeer = this.peerManager.getPeer(params.targetAgentId);
    if (!targetPeer) {
      throw new Error(`Target agent '${params.targetAgentId}' not found in known peers`);
    }

    if (this.peerManager.isBlocked(params.targetAgentId)) {
      throw new Error(`Cannot invoke capability on blocked peer '${params.targetAgentId}'`);
    }

    const classification = params.dataClassification || "PUBLIC";

    // 1. Data Classification Check (Never transmit secrets)
    this.verifyDataExfiltrationSafety(params.input, classification);

    // 2. Local Policy Evaluation for CAPABILITY_INVOCATION
    const capDecision = this.policyEngine.evaluate(
      {
        type: "CAPABILITY_INVOCATION",
        target: `${params.targetAgentId}:${params.capabilityId}`,
        parameters: {
          targetAgent: params.targetAgentId,
          capability: params.capabilityId,
          classification,
        },
      },
      this.policy
    );

    if (capDecision.decision === "DENY") {
      this.logAudit("CAPABILITY_INVOCATION_DENIED", {
        target: params.targetAgentId,
        capability: params.capabilityId,
        reason: capDecision.reason,
      });
      throw new Error(`Local policy denied capability invocation: ${capDecision.reason}`);
    }

    // 3. Local Policy Evaluation for DATA_TRANSFER
    const transferDecision = this.policyEngine.evaluate(
      {
        type:
          classification === "SENSITIVE" || classification === "SECRET"
            ? "SENSITIVE_DATA_TRANSFER"
            : "DATA_TRANSFER",
        target: params.targetAgentId,
        parameters: { classification },
      },
      this.policy
    );

    if (transferDecision.decision === "DENY") {
      this.logAudit("DATA_TRANSFER_DENIED", {
        target: params.targetAgentId,
        classification,
        reason: transferDecision.reason,
      });
      throw new Error(
        `Local policy denied data transfer (${classification}): ${transferDecision.reason}`
      );
    }

    this.logAudit("CAPABILITY_INVOCATION_ALLOWED", {
      target: params.targetAgentId,
      capability: params.capabilityId,
    });
    this.logAudit("DATA_TRANSFER_ALLOWED", {
      target: params.targetAgentId,
      classification,
    });

    // 4. Construct and Sign CapabilityRequest
    const requestId = `req_${crypto.randomUUID()}`;
    const timeoutMs = params.timeoutMs || 4000;
    const deadline = new Date(Date.now() + timeoutMs).toISOString();

    const request: CapabilityRequest = {
      request_id: requestId,
      caller_agent_id: this.keyPair.identity.agent_id,
      target_agent_id: params.targetAgentId,
      capability_id: params.capabilityId,
      capability_version: params.capabilityVersion || "1.0",
      input: params.input,
      deadline,
      data_classification: classification,
    };

    const requestToSign = MessageAuthenticator.canonicalize(request);
    request.signature = IdentityManager.sign(requestToSign, this.keyPair.private_key);

    this.logAudit("CAPABILITY_INVOCATION_REQUESTED", {
      requestId,
      target: params.targetAgentId,
      capability: params.capabilityId,
    });

    // 5. Send over transport and await response
    const networkMsg = {
      message_id: `msg_${crypto.randomUUID()}`,
      sender_agent_id: this.keyPair.identity.agent_id,
      recipient_agent_id: params.targetAgentId,
      message_type: "CAPABILITY_REQUEST" as const,
      timestamp: new Date().toISOString(),
      nonce: crypto.randomBytes(16).toString("hex"),
      payload: request,
      signature: "",
      protocol_version: "1.0.0",
    };
    networkMsg.signature = IdentityManager.sign(
      MessageAuthenticator.computeSigningPayload(networkMsg),
      this.keyPair.private_key
    );

    return new Promise<CapabilityResponse>((resolve, reject) => {
      let isResolved = false;
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.reputationManager.recordEvent({
            agent_id: params.targetAgentId,
            event_type: "TIMEOUT",
            request_id: requestId,
            evidence_reference: `Timeout after ${timeoutMs}ms waiting for response`,
          });
          resolve({
            request_id: requestId,
            provider_agent_id: params.targetAgentId,
            status: "TIMEOUT",
            error: `Request timed out after ${timeoutMs}ms`,
          });
        }
      }, timeoutMs);

      const msgHandler = (incoming: any) => {
        if (
          incoming.message_type === "CAPABILITY_RESPONSE" &&
          incoming.payload?.request_id === requestId
        ) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);

            const resPayload = incoming.payload as CapabilityResponse;

            // Verify response signature
            if (resPayload.signature) {
              const resPreimage = {
                request_id: resPayload.request_id,
                provider_agent_id: resPayload.provider_agent_id,
                status: resPayload.status,
                output: resPayload.output,
                error: resPayload.error,
                execution_metadata: resPayload.execution_metadata,
                evidence: resPayload.evidence,
              };
              const isValid = IdentityManager.verify(
                MessageAuthenticator.canonicalize(resPreimage),
                resPayload.signature,
                targetPeer.public_key
              );

              if (!isValid) {
                this.reputationManager.recordEvent({
                  agent_id: params.targetAgentId,
                  event_type: "INVALID_SIGNATURE",
                  request_id: requestId,
                  evidence_reference: "Capability response signature verification failed",
                });
                return resolve({
                  request_id: requestId,
                  provider_agent_id: params.targetAgentId,
                  status: "FAILED",
                  error: "Cryptographic verification of capability response failed",
                });
              }
            }

            // Update reputation based on outcome
            if (resPayload.status === "COMPLETED") {
              this.reputationManager.recordEvent({
                agent_id: params.targetAgentId,
                event_type: "SUCCESSFUL_REQUEST",
                request_id: requestId,
                evidence_reference: "Remote capability execution completed successfully",
              });
            } else {
              this.reputationManager.recordEvent({
                agent_id: params.targetAgentId,
                event_type: "FAILED_REQUEST",
                request_id: requestId,
                evidence_reference: `Remote response status: ${resPayload.status}`,
              });
            }

            resolve(resPayload);
          }
        }
      };

      this.transport.onMessage(msgHandler);
      this.transport.send(networkMsg).catch((err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          this.reputationManager.recordEvent({
            agent_id: params.targetAgentId,
            event_type: "FAILED_REQUEST",
            request_id: requestId,
            evidence_reference: `Transport delivery failed: ${err.message}`,
          });
          resolve({
            request_id: requestId,
            provider_agent_id: params.targetAgentId,
            status: "FAILED",
            error: `Target peer unreachable: ${err.message}`,
          });
        }
      });
    });
  }

  /**
   * Provider-side: Validates and executes an incoming capability request.
   */
  async handleIncomingRequest(request: CapabilityRequest): Promise<CapabilityResponse> {
    const callerPeer = this.peerManager.getPeer(request.caller_agent_id);

    // 1. Verify caller is not blocked
    if (this.peerManager.isBlocked(request.caller_agent_id)) {
      this.logAudit("CAPABILITY_INVOCATION_DENIED", {
        caller: request.caller_agent_id,
        reason: "Peer is blocked",
      });
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "REJECTED",
        error: "Caller agent is blocked by local security policy",
      };
    }

    // 2. Verify signature if peer public key is known
    if (callerPeer && request.signature) {
      const unsignedReq = { ...request, signature: undefined };
      const reqPayload = MessageAuthenticator.canonicalize(unsignedReq);
      const isSigValid = IdentityManager.verify(
        reqPayload,
        request.signature,
        callerPeer.public_key
      );
      if (!isSigValid) {
        this.reputationManager.recordEvent({
          agent_id: request.caller_agent_id,
          event_type: "INVALID_SIGNATURE",
          request_id: request.request_id,
          evidence_reference: "Incoming capability request signature was invalid",
        });
        return {
          request_id: request.request_id,
          provider_agent_id: this.keyPair.identity.agent_id,
          status: "REJECTED",
          error: "Invalid request signature",
        };
      }
    }

    // 3. Deadline check
    const deadlineTime = new Date(request.deadline).getTime();
    if (!isNaN(deadlineTime) && Date.now() > deadlineTime) {
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "TIMEOUT",
        error: "Request deadline expired before execution started",
      };
    }

    // 4. Resource & Rate Limits
    const reqSize = Buffer.byteLength(JSON.stringify(request));
    try {
      this.resourceGuard.checkIncomingRequest(
        request.caller_agent_id,
        request.capability_id,
        reqSize
      );
    } catch (limitErr: any) {
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "REJECTED",
        error: limitErr.message,
      };
    }

    // 5. Capability Resolution
    const cap = this.registry.findCompatible(request.capability_id, request.capability_version);
    if (!cap) {
      this.resourceGuard.releaseRequest();
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "REJECTED",
        error: `Capability '${request.capability_id}' not found or incompatible`,
      };
    }

    // 6. Provider Local Policy Evaluation (REMOTE_READ or CAPABILITY_INVOCATION)
    const policyDecision = this.policyEngine.evaluate(
      {
        type: "REMOTE_READ",
        target: `${request.caller_agent_id}:${cap.capability_id}`,
        parameters: {
          caller: request.caller_agent_id,
          capability: cap.capability_id,
        },
      },
      this.policy
    );

    if (policyDecision.decision === "DENY") {
      this.resourceGuard.releaseRequest();
      this.logAudit("CAPABILITY_INVOCATION_DENIED", {
        caller: request.caller_agent_id,
        capability: cap.capability_id,
        reason: policyDecision.reason,
      });
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "REJECTED",
        error: `Provider policy denied capability execution: ${policyDecision.reason}`,
      };
    }

    // 7. Execute registered executor
    const executor = this.executors.get(cap.capability_id) || this.executors.get(cap.name);
    if (!executor) {
      this.resourceGuard.releaseRequest();
      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "FAILED",
        error: `No executor implementation registered for capability '${cap.capability_id}'`,
      };
    }

    this.logAudit("CAPABILITY_EXECUTION_STARTED", {
      requestId: request.request_id,
      caller: request.caller_agent_id,
      capability: cap.capability_id,
    });

    try {
      const execResult = await executor(request.input, request.caller_agent_id);
      this.resourceGuard.releaseRequest();

      const response: CapabilityResponse = {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "COMPLETED",
        output: execResult.output,
        evidence: execResult.evidence,
        execution_metadata: {
          timestamp: new Date().toISOString(),
          capability_id: cap.capability_id,
        },
      };

      // Sign response
      const resPreimage = {
        request_id: response.request_id,
        provider_agent_id: response.provider_agent_id,
        status: response.status,
        output: response.output,
        error: response.error,
        execution_metadata: response.execution_metadata,
        evidence: response.evidence,
      };
      response.signature = IdentityManager.sign(
        MessageAuthenticator.canonicalize(resPreimage),
        this.keyPair.private_key
      );

      this.logAudit("CAPABILITY_EXECUTION_COMPLETED", {
        requestId: request.request_id,
        caller: request.caller_agent_id,
      });

      return response;
    } catch (execErr: any) {
      this.resourceGuard.releaseRequest();
      this.logAudit("CAPABILITY_EXECUTION_FAILED", {
        requestId: request.request_id,
        error: execErr.message,
      });

      return {
        request_id: request.request_id,
        provider_agent_id: this.keyPair.identity.agent_id,
        status: "FAILED",
        error: execErr.message || "Capability execution failure",
      };
    }
  }

  private verifyDataExfiltrationSafety(data: unknown, classification: DataClassification): void {
    if (classification === "SECRET") {
      throw new Error(
        "Security boundary violation: Transmission of SECRET data classification is forbidden"
      );
    }

    const serialized = JSON.stringify(data).toLowerCase();
    const bannedPatterns = [
      "private_key",
      "password",
      "cookie",
      "session_secret",
      "auth_token",
      "pkcs8",
    ];

    for (const pattern of bannedPatterns) {
      if (serialized.includes(pattern)) {
        throw new Error(
          `Security boundary violation: Potential credential/secret leak detected in payload ('${pattern}')`
        );
      }
    }
  }

  private logAudit(eventType: any, metadata: Record<string, unknown>): void {
    if (this.auditStore) {
      this.auditStore.append({
        event_id: `evt_net_${crypto.randomUUID()}`,
        session_id: "network_session",
        agent_id: this.keyPair.identity.agent_id,
        timestamp: new Date().toISOString(),
        event_type: eventType,
        action: "network_action",
        security_metadata: {
          severity: eventType.includes("DENIED") ? "HIGH" : "INFO",
          category: "NETWORK",
        },
        metadata,
      });
    }
  }
}
