# Network REST API Reference

The OpenAgent API server exposes routes for inspecting decentralized network node status, peers, capabilities, and reputation metrics.

## Endpoints

### 1. Network Status

- **`GET /api/v1/network/status`**
  - Returns local node identity, Ed25519 public key, transport status, peer count, and registered capabilities count.

### 2. Peers Management

- **`GET /api/v1/peers`**
  - List all known and discovered peers.
- **`POST /api/v1/peers/connect`**
  - Register or connect to a peer.
  - Body: `{ agent_id: string, public_key: string, addresses?: string[] }`
- **`GET /api/v1/peers/:agent_id`**
  - Inspect peer details, trust state, and reputation score.
- **`POST /api/v1/peers/:agent_id/block`**
  - Block a peer.
  - Body: `{ reason?: string }`
- **`POST /api/v1/peers/:agent_id/unblock`**
  - Remove peer from local blocklist.

### 3. Capabilities Management

- **`GET /api/v1/capabilities`**
  - List all locally registered and discovered capabilities.
- **`GET /api/v1/capabilities/search?q=<query>`**
  - Search capabilities by keyword.
- **`GET /api/v1/capabilities/:capability_id`**
  - Inspect capability schema, risk level, and required permissions.
- **`POST /api/v1/capabilities/register`**
  - Register a new capability manifest.
- **`POST /api/v1/capabilities/invoke`**
  - Invoke a remote capability with policy gatekeeping.
  - Body: `{ peer_id: string, capability_id: string, parameters: object }`

### 4. Reputation Metrics

- **`GET /api/v1/reputation/:agent_id`**
  - Get numerical reputation score, request counts, and recent evidence trail.

## Source Reference

- Handler: [`packages/network/src/api/routes.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/api/routes.ts)
- Integration: [`packages/core/src/api/server.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/core/src/api/server.ts)
