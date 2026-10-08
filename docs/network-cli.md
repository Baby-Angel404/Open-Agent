# Network CLI Reference

The `openagent` command-line utility provides commands to manage the decentralized agent networking layer.

## Commands Summary

### Network Status

```bash
openagent network status [--storage <dir>]
```

Displays local agent identity, Ed25519 public key fingerprint, active peers, advertised capabilities, and security gatekeeper status.

### Peer Management

```bash
# List all known peers
openagent peer list [--format json] [--storage <dir>]

# Inspect a specific peer
openagent peer inspect <agent-id> [--format json]

# Connect or register a peer
openagent peer connect <address-or-id> [--pubkey <hex>] [--address <url>]

# Disconnect from a peer
openagent peer disconnect <agent-id>

# Block a peer
openagent peer block <agent-id> [--reason <reason>]

# Unblock a peer
openagent peer unblock <agent-id>
```

### Capability Management

```bash
# List available capabilities
openagent capability list [--format json]

# Search capabilities
openagent capability search <query>

# Inspect capability schema
openagent capability inspect <capability-id>

# Register a new capability
openagent capability register --file <manifest.json>

# Invoke a capability on a remote agent
openagent capability invoke <agent-id> <capability-id> [--params <json>] [--file <params.json>]
```

### Reputation Inspection

```bash
openagent reputation show <agent-id> [--format json]
```

Displays current numerical score (0-100), success/failure counts, and chronologically ordered evidence events.

## Source Reference

- CLI Implementation: [`apps/cli/src/bin/openagent.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/apps/cli/src/bin/openagent.ts)
- Command Handlers: [`apps/cli/src/commands/`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/apps/cli/src/commands/)
