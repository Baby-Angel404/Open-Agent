export type KeyAlgorithm = "Ed25519";

export interface AgentIdentity {
  agent_id: string;
  public_key: string; // Base64 or Hex encoded public key
  key_algorithm: KeyAlgorithm;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface AgentKeyPair {
  identity: AgentIdentity;
  private_key: string; // Base64 or Hex encoded private key (STRICTLY LOCAL)
}

export type MessageType =
  | "HELLO"
  | "HELLO_ACK"
  | "CAPABILITY_ADVERTISE"
  | "CAPABILITY_REQUEST"
  | "CAPABILITY_RESPONSE"
  | "PING"
  | "PONG"
  | "DISCONNECT";

export interface NetworkMessage<T = unknown> {
  message_id: string;
  sender_agent_id: string;
  recipient_agent_id: string;
  message_type: MessageType;
  timestamp: string;
  nonce: string;
  payload: T;
  signature: string;
  protocol_version: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CapabilityAvailability = "ONLINE" | "BUSY" | "OFFLINE";

export type DataClassification = "PUBLIC" | "INTERNAL" | "SENSITIVE" | "SECRET";

export interface Capability {
  capability_id: string;
  name: string;
  version: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  required_permissions: string[];
  risk_level: RiskLevel;
  provider_agent_id: string;
  availability: CapabilityAvailability;
  metadata?: Record<string, unknown>;
}

export type TrustState = "UNKNOWN" | "OBSERVED" | "VERIFIED" | "TRUSTED" | "BLOCKED";

export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR";

export interface Peer {
  peer_id: string;
  agent_id: string;
  public_key: string;
  addresses: string[];
  capabilities: Capability[];
  first_seen: string;
  last_seen: string;
  connection_status: ConnectionStatus;
  trust_state: TrustState;
  reputation_score: number;
}

export type InvocationStatus =
  "ACCEPTED" | "REJECTED" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT" | "CANCELLED";

export interface RemoteProvenanceEvidence {
  source_agent_id: string;
  capability_id: string;
  request_id: string;
  document_id?: string;
  chunk_id?: string;
  snippet?: string;
  confidence: number;
  verified_local: boolean;
}

export interface CapabilityRequest {
  request_id: string;
  caller_agent_id: string;
  target_agent_id: string;
  capability_id: string;
  capability_version: string;
  input: Record<string, unknown>;
  deadline: string;
  requested_permissions?: string[];
  data_classification: DataClassification;
  signature?: string;
}

export interface CapabilityResponse {
  request_id: string;
  provider_agent_id: string;
  status: InvocationStatus;
  output?: unknown;
  error?: string;
  execution_metadata?: Record<string, unknown>;
  evidence?: RemoteProvenanceEvidence[];
  signature?: string;
}

export type ReputationEventType =
  | "SUCCESSFUL_REQUEST"
  | "FAILED_REQUEST"
  | "TIMEOUT"
  | "POLICY_VIOLATION"
  | "INVALID_SIGNATURE"
  | "MALFORMED_MESSAGE"
  | "REPLAY_ATTEMPT"
  | "USER_REPORT";

export interface ReputationEvent {
  event_id: string;
  agent_id: string;
  event_type: ReputationEventType;
  request_id?: string;
  timestamp: string;
  evidence_reference: string;
  score_delta: number;
}

export interface ReputationRecord {
  agent_id: string;
  successful_requests: number;
  failed_requests: number;
  timeouts: number;
  policy_violations: number;
  invalid_messages: number;
  user_reports: number;
  score: number; // 0.0 - 100.0, default 50.0
  updated_at: string;
}

export interface NetworkLimits {
  max_request_size_bytes: number;
  max_response_size_bytes: number;
  max_execution_time_ms: number;
  max_concurrent_requests: number;
  max_requests_per_peer_per_minute: number;
  max_requests_per_capability_per_minute: number;
  clock_skew_tolerance_ms: number;
  max_cached_nonces?: number;
}

export interface HandshakeHello {
  protocol_version: string;
  sender_identity: AgentIdentity;
  timestamp: string;
  nonce: string;
  supported_capabilities: string[];
}

export interface HandshakeAck {
  protocol_version: string;
  responder_identity: AgentIdentity;
  timestamp: string;
  nonce: string;
  session_id: string;
  accepted: boolean;
  reason?: string;
}

export interface NetworkStorageManifest {
  schema_version: string;
  agent_id: string;
  total_peers: number;
  total_capabilities: number;
  total_reputation_records: number;
  blocked_peers: number;
  updated_at: string;
}
