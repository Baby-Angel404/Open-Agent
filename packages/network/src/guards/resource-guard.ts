import { NetworkLimits } from "../types/index.js";
import { DEFAULT_NETWORK_LIMITS } from "../protocol/authenticator.js";

export class ResourceLimitError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ResourceLimitError";
    this.code = code;
  }
}

export class ResourceGuard {
  private limits: NetworkLimits;
  private peerRequestTimestamps: Map<string, number[]> = new Map();
  private capabilityRequestTimestamps: Map<string, number[]> = new Map();
  private activeConcurrentRequests = 0;

  constructor(limits: Partial<NetworkLimits> = {}) {
    this.limits = { ...DEFAULT_NETWORK_LIMITS, ...limits };
  }

  checkIncomingRequest(peerId: string, capabilityId: string, payloadSize: number): void {
    // 1. Payload size
    if (payloadSize > this.limits.max_request_size_bytes) {
      throw new ResourceLimitError(
        "NETWORK_PAYLOAD_TOO_LARGE",
        `Incoming request payload size (${payloadSize} bytes) exceeds limit of ${this.limits.max_request_size_bytes} bytes`
      );
    }

    // 2. Concurrency limit
    if (this.activeConcurrentRequests >= this.limits.max_concurrent_requests) {
      throw new ResourceLimitError(
        "NETWORK_CONCURRENCY_LIMIT_EXCEEDED",
        `Concurrent requests limit (${this.limits.max_concurrent_requests}) reached`
      );
    }

    const now = Date.now();
    const windowStart = now - 60000;

    // 3. Per-peer rate limiting
    const peerTimestamps = (this.peerRequestTimestamps.get(peerId) || []).filter(
      (t) => t > windowStart
    );
    if (peerTimestamps.length >= this.limits.max_requests_per_peer_per_minute) {
      throw new ResourceLimitError(
        "NETWORK_RATE_LIMIT_EXCEEDED",
        `Peer '${peerId}' exceeded rate limit of ${this.limits.max_requests_per_peer_per_minute} req/min`
      );
    }
    peerTimestamps.push(now);
    this.peerRequestTimestamps.set(peerId, peerTimestamps);

    // 4. Per-capability rate limiting
    const capTimestamps = (this.capabilityRequestTimestamps.get(capabilityId) || []).filter(
      (t) => t > windowStart
    );
    if (capTimestamps.length >= this.limits.max_requests_per_capability_per_minute) {
      throw new ResourceLimitError(
        "NETWORK_CAPABILITY_LIMIT_EXCEEDED",
        `Capability '${capabilityId}' exceeded rate limit of ${this.limits.max_requests_per_capability_per_minute} req/min`
      );
    }
    capTimestamps.push(now);
    this.capabilityRequestTimestamps.set(capabilityId, capTimestamps);

    this.activeConcurrentRequests++;
  }

  releaseRequest(): void {
    if (this.activeConcurrentRequests > 0) {
      this.activeConcurrentRequests--;
    }
  }

  checkResponseSize(size: number): void {
    if (size > this.limits.max_response_size_bytes) {
      throw new ResourceLimitError(
        "NETWORK_RESPONSE_TOO_LARGE",
        `Outgoing capability response size (${size} bytes) exceeds limit of ${this.limits.max_response_size_bytes} bytes`
      );
    }
  }

  getActiveConcurrent(): number {
    return this.activeConcurrentRequests;
  }
}
