# Backup, Verification & Restore Guide

## 1. Overview

OpenAgent Desktop includes a built-in cryptographic backup and migration engine designed for disaster recovery, workstation migration, and audit compliance.

## 2. Backup Format Specification

Backup packages are formatted as single self-contained JSON archives:

- **Manifest**:
  - `version`: Backup schema specification (`1.0`).
  - `appVersion`: Application release version (`0.1.0`).
  - `createdAt`: ISO 8601 generation timestamp.
  - `checksum`: Top-level SHA-256 digest calculated across all relative file paths and individual content digests.
  - `files`: Array of entries containing relative paths, byte lengths, and individual SHA-256 digests.
- **Payload**:
  - Key-value mapping of relative paths to Base64-encoded file contents.

## 3. Creating a Backup

### Via Desktop GUI

1. Navigate to **Settings & Security** view.
2. Under **Backup, Verification & Restore**, enter target file path (e.g. `/home/user/openagent-backup.json`).
3. Click **Create Backup**.

### Via API / CLI

Invoke the IPC channel `backup:create`:

```json
{
  "destinationPath": "/path/to/backup.json",
  "includeAuditLogs": true,
  "includeKnowledgeBase": true
}
```

## 4. Integrity Verification

Before any restoration, the engine performs strict validation:

1. Manifest syntax and schema verification.
2. Path traversal security check (rejects any paths starting with `..` or absolute prefixes).
3. Payload hash comparison for every file against its manifest digest.
4. Top-level SHA-256 checksum verification.

To verify manually from the UI, enter the backup file path and click **Verify Checksum**.

## 5. Restoring a Backup

1. Enter the verified backup path in the desktop UI.
2. Click **Restore**.
3. Confirm the dialog prompt. Existing files will be atomically updated.
4. Restart the application or click **Refresh** to re-index restored knowledge graphs and audit entries.
