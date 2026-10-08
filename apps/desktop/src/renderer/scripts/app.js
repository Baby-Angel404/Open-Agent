// OpenAgent Desktop UI Controller
(function () {
  const desktop = window.openAgentDesktop || {
    // Fallback if accessed outside electron window for browser testing
    invoke: async (channel, payload) => {
      console.warn("Desktop bridge not found, running with fallback mock for:", channel, payload);
      return { success: true, data: {} };
    },
    on: () => () => {},
  };

  // State
  let currentSessionId = null;

  // DOM Elements
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".workspace-view");
  const pageTitle = document.getElementById("page-title");
  const btnRefresh = document.getElementById("btn-refresh");

  // Navigation Routing
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetId = item.getAttribute("data-target");
      navItems.forEach((n) => n.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));

      item.classList.add("active");
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add("active");

      pageTitle.textContent = item.querySelector("span:last-child")?.textContent || "Dashboard";
      refreshActiveView(targetId);
    });
  });

  async function refreshSystemStatus() {
    try {
      const res = await desktop.invoke("system:getStatus");
      if (res && res.success && res.data) {
        const data = res.data;
        document.getElementById("metric-sessions").textContent = data.metrics.activeSessions;
        document.getElementById("metric-audit").textContent = data.metrics.auditEventsCount;
        document.getElementById("metric-graph").textContent = data.metrics.graphEntitiesCount;
        document.getElementById("metric-peers").textContent = data.metrics.knownPeersCount;

        if (data.loopbackGatewayUrl) {
          document.getElementById("gateway-link").textContent = data.loopbackGatewayUrl;
          const urlObj = new URL(data.loopbackGatewayUrl);
          document.getElementById("gateway-port-indicator").textContent = `Port: ${urlObj.port}`;
        }
      }
    } catch (err) {
      console.error("Failed to refresh status:", err);
    }
  }

  async function refreshSessions() {
    try {
      const res = await desktop.invoke("session:list");
      const tbody = document.getElementById("sessions-table-body");
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        tbody.innerHTML = "";
        res.data.forEach((s) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><code>${s.id}</code></td>
            <td><span class="badge ${s.status === "completed" ? "badge-online" : "badge-warning"}">${s.status.toUpperCase()}</span></td>
            <td>${escapeHtml(s.goal)}</td>
            <td>
              <button class="btn btn-secondary btn-step-session" data-id="${s.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Step</button>
              <button class="btn btn-danger btn-stop-session" data-id="${s.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Stop</button>
            </td>
          `;
          tbody.appendChild(tr);
        });

        // Bind step and stop buttons
        tbody.querySelectorAll(".btn-step-session").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = btn.getAttribute("data-id");
            const stepRes = await desktop.invoke("session:runTask", {
              sessionId: sid,
              task: "step",
            });
            logAgentEvent(`Step executed for session ${sid}: ${JSON.stringify(stepRes)}`);
            refreshSessions();
          });
        });

        tbody.querySelectorAll(".btn-stop-session").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = btn.getAttribute("data-id");
            await desktop.invoke("session:stop", { sessionId: sid });
            refreshSessions();
          });
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No active sessions</td></tr>`;
      }
    } catch (err) {
      console.error("Failed to list sessions:", err);
    }
  }

  function logAgentEvent(msg) {
    const logBox = document.getElementById("agent-event-log");
    const timestamp = new Date().toLocaleTimeString();
    logBox.textContent = `[${timestamp}] ${msg}\n` + logBox.textContent;
  }

  // Session Creation Form
  const sessionForm = document.getElementById("form-create-session");
  if (sessionForm) {
    sessionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const goalInput = document.getElementById("input-agent-goal");
      const goal = goalInput.value.trim();
      if (!goal) return;

      const res = await desktop.invoke("session:create", { agentId: "desktop_local", goal });
      if (res && res.success) {
        currentSessionId = res.data.sessionId;
        logAgentEvent(`Session created: ${currentSessionId} with goal: "${goal}"`);
        goalInput.value = "";
        refreshSessions();
      } else {
        alert("Failed to create session: " + (res.error?.message || "Unknown error"));
      }
    });
  }

  // Browser Navigation Form
  const browserForm = document.getElementById("form-browser-nav");
  if (browserForm) {
    browserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const urlInput = document.getElementById("input-browser-url");
      const url = urlInput.value.trim();
      const logBox = document.getElementById("browser-result-log");

      logBox.textContent = `Navigating to ${url}...\n` + logBox.textContent;
      const res = await desktop.invoke("browser:navigate", {
        sessionId: currentSessionId || "browser_session",
        url,
      });
      if (res && res.success) {
        logBox.textContent = `[SUCCESS] Navigated to: ${res.data.url}\n` + logBox.textContent;
      } else {
        logBox.textContent =
          `[ERROR] ${res.error?.message || "Navigation blocked"}\n` + logBox.textContent;
      }
    });
  }

  // Browser Action Execution
  const btnBrowserExec = document.getElementById("btn-browser-execute");
  if (btnBrowserExec) {
    btnBrowserExec.addEventListener("click", async () => {
      const action = document.getElementById("select-browser-action").value;
      const selector = document.getElementById("input-browser-selector").value.trim();
      const text = document.getElementById("input-browser-text").value.trim();
      const logBox = document.getElementById("browser-result-log");

      const res = await desktop.invoke("browser:action", {
        sessionId: currentSessionId || "browser_session",
        action,
        selector,
        text,
      });

      if (res && res.success) {
        logBox.textContent =
          `[SUCCESS] Action '${action}' executed successfully.\n` + logBox.textContent;
      } else {
        logBox.textContent =
          `[ERROR] ${res.error?.message || "Action failed"}\n` + logBox.textContent;
      }
    });
  }

  // RAG Ingestion Form
  const ragIngestForm = document.getElementById("form-rag-ingest");
  if (ragIngestForm) {
    ragIngestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("input-doc-title").value.trim();
      const content = document.getElementById("input-doc-content").value.trim();

      const res = await desktop.invoke("rag:ingest", { title, content });
      if (res && res.success) {
        alert(`Document ingested successfully! Created ${res.data.chunksCount} vector chunks.`);
        document.getElementById("input-doc-title").value = "";
        document.getElementById("input-doc-content").value = "";
        refreshGraphEntities();
        refreshSystemStatus();
      } else {
        alert("Ingest error: " + (res.error?.message || "Failed"));
      }
    });
  }

  // RAG Query Form
  const ragQueryForm = document.getElementById("form-rag-query");
  if (ragQueryForm) {
    ragQueryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const query = document.getElementById("input-rag-query").value.trim();
      const resBox = document.getElementById("rag-query-result");

      resBox.textContent = `Searching knowledge graph and vector space for: "${query}"...`;
      const res = await desktop.invoke("rag:query", { query });
      if (res && res.success) {
        resBox.textContent = `Answer:\n${res.data.answer}\n\nSources: ${JSON.stringify(res.data.sources, null, 2)}`;
      } else {
        resBox.textContent = `Error: ${res.error?.message || "Query failed"}`;
      }
    });
  }

  async function refreshGraphEntities() {
    try {
      const res = await desktop.invoke("rag:getGraph");
      const tbody = document.getElementById("graph-entities-table-body");
      if (res && res.success && Array.isArray(res.data.entities) && res.data.entities.length > 0) {
        tbody.innerHTML = "";
        res.data.entities.forEach((ent) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td><code>${ent.id}</code></td><td>${escapeHtml(ent.name)}</td><td><span class="badge badge-online">${ent.type}</span></td>`;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No entities loaded</td></tr>`;
      }
    } catch (err) {
      console.error("Failed to load graph:", err);
    }
  }

  // Network Explorer
  async function refreshNetwork() {
    try {
      const statusRes = await desktop.invoke("network:getStatus");
      if (statusRes && statusRes.success) {
        const idBox = document.getElementById("network-identity-box");
        idBox.textContent = `Node ID: ${statusRes.data.nodeId}\nListen Port: ${statusRes.data.listenPort}\nPeers: ${statusRes.data.connectedPeers}\nCapabilities: ${statusRes.data.advertisedCapabilities.join(", ") || "None"}`;
      }

      const peersRes = await desktop.invoke("network:discoverPeers");
      const tbody = document.getElementById("peers-table-body");
      if (
        peersRes &&
        peersRes.success &&
        Array.isArray(peersRes.data) &&
        peersRes.data.length > 0
      ) {
        tbody.innerHTML = "";
        peersRes.data.forEach((p) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><code>${p.agent_id}</code></td>
            <td><code>${(p.public_key || "").substring(0, 16)}...</code></td>
            <td>${(p.addresses || []).join(", ") || "local"}</td>
            <td><span class="badge badge-online">CONNECTED</span></td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error("Failed to load network:", err);
    }
  }

  // Capabilities & Plugins
  async function refreshCapabilities() {
    try {
      const res = await desktop.invoke("plugins:list");
      const tbody = document.getElementById("capabilities-table-body");
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        tbody.innerHTML = "";
        res.data.forEach((cap) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${escapeHtml(cap.name)}</strong></td>
            <td>${cap.version}</td>
            <td><span class="badge ${cap.riskLevel === "LOW" ? "badge-online" : "badge-warning"}">${cap.riskLevel}</span></td>
            <td>${escapeHtml(cap.description || "")}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error("Failed to load capabilities:", err);
    }
  }

  const capForm = document.getElementById("form-register-cap");
  if (capForm) {
    capForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("input-cap-name").value.trim();
      const version = document.getElementById("input-cap-version").value.trim();
      const riskLevel = document.getElementById("select-cap-risk").value;
      const description = document.getElementById("input-cap-desc").value.trim();

      const res = await desktop.invoke("plugins:register", {
        name,
        version,
        riskLevel,
        description,
      });
      if (res && res.success) {
        alert(`Capability '${name}' registered successfully!`);
        document.getElementById("input-cap-name").value = "";
        document.getElementById("input-cap-version").value = "";
        document.getElementById("input-cap-desc").value = "";
        refreshCapabilities();
      } else {
        alert("Registration failed: " + (res.error?.message || "Unknown error"));
      }
    });
  }

  // Credential Vault
  const btnVaultSave = document.getElementById("btn-vault-save");
  if (btnVaultSave) {
    btnVaultSave.addEventListener("click", async () => {
      const key = document.getElementById("input-vault-key").value.trim();
      const val = document.getElementById("input-vault-val").value;
      const statusBox = document.getElementById("vault-status-box");

      if (!key || !val) {
        alert("Both key and secret value are required");
        return;
      }

      const res = await desktop.invoke("vault:setSecret", { key, secret: val });
      if (res && res.success) {
        statusBox.textContent = `Secret for '${key}' encrypted and stored safely.`;
        document.getElementById("input-vault-val").value = "";
      } else {
        statusBox.textContent = `Failed: ${res.error?.message || "Vault write error"}`;
      }
    });
  }

  // Backup & Restore
  const btnCreateBackup = document.getElementById("btn-create-backup");
  const btnVerifyBackup = document.getElementById("btn-verify-backup");
  const btnRestoreBackup = document.getElementById("btn-restore-backup");
  const backupLog = document.getElementById("backup-result-log");

  if (btnCreateBackup) {
    btnCreateBackup.addEventListener("click", async () => {
      const dest =
        document.getElementById("input-backup-path").value.trim() || "/tmp/openagent-backup.json";
      backupLog.textContent = `Creating backup archive at ${dest}...`;
      const res = await desktop.invoke("backup:create", {
        destinationPath: dest,
        includeAuditLogs: true,
        includeKnowledgeBase: true,
      });
      if (res && res.success) {
        backupLog.textContent = `[BACKUP CREATED]\nPath: ${res.data.destinationPath}\nSHA-256 Checksum: ${res.data.checksum}`;
      } else {
        backupLog.textContent = `[ERROR] ${res.error?.message || "Backup failed"}`;
      }
    });
  }

  if (btnVerifyBackup) {
    btnVerifyBackup.addEventListener("click", async () => {
      const dest =
        document.getElementById("input-backup-path").value.trim() || "/tmp/openagent-backup.json";
      backupLog.textContent = `Verifying checksum and integrity for ${dest}...`;
      const res = await desktop.invoke("backup:verify", { backupFilePath: dest });
      if (res && res.success) {
        backupLog.textContent = `[VERIFICATION SUCCESS]\nArchive Valid: true\nCreated: ${res.data.manifest.createdAt}\nChecksum: ${res.data.manifest.checksum}`;
      } else {
        backupLog.textContent = `[VERIFICATION FAILED]\nError: ${res.error?.message || "Invalid archive"}`;
      }
    });
  }

  if (btnRestoreBackup) {
    btnRestoreBackup.addEventListener("click", async () => {
      const dest =
        document.getElementById("input-backup-path").value.trim() || "/tmp/openagent-backup.json";
      if (!confirm("Are you sure you want to restore? This will merge and restore data.")) return;
      backupLog.textContent = `Restoring backup from ${dest}...`;
      const res = await desktop.invoke("backup:restore", {
        backupFilePath: dest,
        overwriteExisting: true,
      });
      if (res && res.success) {
        backupLog.textContent = `[RESTORE SUCCESS]\nRestored ${res.data.restoredFilesCount} files safely.`;
        refreshSystemStatus();
      } else {
        backupLog.textContent = `[RESTORE ERROR]\n${res.error?.message || "Restore failed"}`;
      }
    });
  }

  function refreshActiveView(targetId) {
    switch (targetId) {
      case "view-status":
        refreshSystemStatus();
        break;
      case "view-agents":
        refreshSessions();
        break;
      case "view-rag":
        refreshGraphEntities();
        break;
      case "view-network":
        refreshNetwork();
        break;
      case "view-plugins":
        refreshCapabilities();
        break;
    }
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      refreshSystemStatus();
      refreshSessions();
      refreshGraphEntities();
      refreshNetwork();
      refreshCapabilities();
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Initial load
  refreshSystemStatus();
})();
