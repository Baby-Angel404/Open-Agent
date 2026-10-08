export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAgent Infrastructure — Security & Audit Console</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --border: #334155;
      --danger: #ef4444;
      --warning: #f59e0b;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    .badge {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 9999px;
      background: #0284c7;
      color: white;
    }
    .badge.success { background: var(--success); }
    .badge.danger { background: var(--danger); }
    .badge.warning { background: var(--warning); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card h3 { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
    .card .val { font-size: 1.8rem; font-weight: bold; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab-btn {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .tab-btn.active { background: var(--accent); color: #000; font-weight: bold; border-color: var(--accent); }
    .view-panel { display: none; }
    .view-panel.active { display: block; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 600; background: rgba(0,0,0,0.2); }
    pre {
      background: #000;
      padding: 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      overflow-x: auto;
      color: #38bdf8;
    }
    button.action-btn {
      background: var(--accent);
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    button.action-btn:hover { opacity: 0.9; }
    .alert-banner {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--danger);
      color: #fca5a5;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>OpenAgent Security & Audit Console <span class="badge">Phase 3</span></h1>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">Deterministic Replay, Cryptographic Hash Chain, & Local Observability</p>
    </div>
    <div>
      <button class="action-btn" onclick="verifyAuditIntegrity()">Verify Hash Chain Integrity</button>
    </div>
  </header>

  <div id="integrityResult" style="display: none; margin-bottom: 16px;"></div>

  <div class="grid">
    <div class="card">
      <h3>Active / Total Sessions</h3>
      <div class="val" id="metricSessions">0 / 0</div>
    </div>
    <div class="card">
      <h3>Actions Executed</h3>
      <div class="val" style="color: var(--success);" id="metricExecuted">0</div>
    </div>
    <div class="card">
      <h3>Actions Blocked</h3>
      <div class="val" style="color: var(--danger);" id="metricBlocked">0</div>
    </div>
    <div class="card">
      <h3>Policy Latency (p95)</h3>
      <div class="val" id="metricLatency">0.00 ms</div>
    </div>
    <div class="card">
      <h3>Security Alerts</h3>
      <div class="val" style="color: var(--warning);" id="metricAlerts">0</div>
    </div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('sessions')">Sessions</button>
    <button class="tab-btn" onclick="switchTab('audit')">Audit Events Stream</button>
    <button class="tab-btn" onclick="switchTab('alerts')">Security Alerts</button>
    <button class="tab-btn" onclick="switchTab('replay')">Deterministic Replay</button>
  </div>

  <div id="tab-sessions" class="view-panel active card">
    <h3>Tracked Agent Sessions</h3>
    <table>
      <thead>
        <tr>
          <th>Session ID</th>
          <th>Agent ID</th>
          <th>Status</th>
          <th>Task</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="sessionsTableBody">
        <tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Loading sessions...</td></tr>
      </tbody>
    </table>
  </div>

  <div id="tab-audit" class="view-panel card">
    <h3>Chronological Audit Events</h3>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Event Type</th>
          <th>Action</th>
          <th>Decision</th>
          <th>Result</th>
          <th>Hash</th>
        </tr>
      </thead>
      <tbody id="auditTableBody">
        <tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Loading audit entries...</td></tr>
      </tbody>
    </table>
  </div>

  <div id="tab-alerts" class="view-panel card">
    <h3>Security Alerts & Boundary Violations</h3>
    <div id="alertsList">
      <p style="color: var(--text-muted);">No security alerts recorded.</p>
    </div>
  </div>

  <div id="tab-replay" class="view-panel card">
    <h3>Session Replay Engine (REPLAY_FOR_ANALYSIS)</h3>
    <div style="display: flex; gap: 10px; margin: 12px 0;">
      <input type="text" id="replaySessionId" placeholder="Enter session ID" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); flex: 1;">
      <button class="action-btn" onclick="runReplay()">Reconstruct Timeline</button>
    </div>
    <div id="replayOutput" style="margin-top: 16px;"></div>
  </div>

  <script>
    async function loadData() {
      try {
        const [mRes, sRes, aRes] = await Promise.all([
          fetch('/api/v1/metrics').then(r => r.json()),
          fetch('/api/v1/sessions').then(r => r.json()),
          fetch('/api/v1/audit').then(r => r.json())
        ]);

        if (mRes.success && mRes.data) {
          const m = mRes.data;
          document.getElementById('metricSessions').textContent = \`\${m.sessions.active} / \${m.sessions.created}\`;
          document.getElementById('metricExecuted').textContent = m.actions.executed;
          document.getElementById('metricBlocked').textContent = m.actions.blocked + m.actions.denied;
          document.getElementById('metricLatency').textContent = \`\${m.policyLatency.p95Ms.toFixed(2)} ms\`;
          document.getElementById('metricAlerts').textContent = m.securityViolations.totalAlerts;
        }

        if (sRes.success && Array.isArray(sRes.data)) {
          const tbody = document.getElementById('sessionsTableBody');
          tbody.innerHTML = sRes.data.map(s => \`
            <tr>
              <td><code>\${s.id}</code></td>
              <td>\${s.agentId}</td>
              <td><span class="badge \${s.status === 'COMPLETED' ? 'success' : s.status === 'FAILED' ? 'danger' : ''}">\${s.status}</span></td>
              <td>\${s.task}</td>
              <td>\${new Date(s.createdAt).toLocaleTimeString()}</td>
              <td>
                <button class="action-btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="loadReplayFor('\${s.id}')">Replay</button>
              </td>
            </tr>
          \`).join('');
        }

        if (aRes.success && Array.isArray(aRes.data)) {
          const tbody = document.getElementById('auditTableBody');
          tbody.innerHTML = aRes.data.slice(-50).reverse().map(e => \`
            <tr>
              <td>\${new Date(e.timestamp).toLocaleTimeString()}</td>
              <td><code>\${e.event_type || e.stage}</code></td>
              <td>\${e.action || '-'}</td>
              <td>\${e.policy_decision || '-'}</td>
              <td>\${e.result || '-'}</td>
              <td><code title="\${e.hash}">\${(e.hash || '').substring(0, 10)}...</code></td>
            </tr>
          \`).join('');

          // Populate alerts
          const alerts = aRes.data.filter(e => e.security_metadata && (e.security_metadata.severity === 'HIGH' || e.security_metadata.severity === 'CRITICAL' || e.security_metadata.alert));
          const alertsDiv = document.getElementById('alertsList');
          if (alerts.length > 0) {
            alertsDiv.innerHTML = alerts.map(a => \`
              <div class="alert-banner" style="margin-bottom: 8px;">
                <strong>[\${a.security_metadata.severity}] \${a.security_metadata.category || 'ALERT'}:</strong>
                \${a.security_metadata.classification_reason || a.reason || 'Security boundary triggered'}
                <div style="font-size: 0.75rem; margin-top: 4px; color: var(--text-muted);">Event: \${a.event_id} | Session: \${a.session_id} | \${a.timestamp}</div>
              </div>
            \`).join('');
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function verifyAuditIntegrity() {
      const banner = document.getElementById('integrityResult');
      banner.style.display = 'block';
      banner.className = 'alert-banner';
      banner.innerHTML = 'Verifying SHA-256 hash chain...';

      try {
        const res = await fetch('/api/v1/audit/verify', { method: 'POST' }).then(r => r.json());
        if (res.success && res.data.valid) {
          banner.style.borderColor = 'var(--success)';
          banner.style.background = 'rgba(16, 185, 129, 0.1)';
          banner.style.color = '#6ee7b7';
          banner.innerHTML = \`✓ Cryptographic Hash Chain Verified: \${res.data.totalEntries} entries intact with zero tampering detected.\`;
        } else {
          banner.style.borderColor = 'var(--danger)';
          banner.style.background = 'rgba(239, 68, 68, 0.1)';
          banner.style.color = '#fca5a5';
          banner.innerHTML = \`✗ Integrity Check Failed! \${res.data.reason || 'Tampering detected'}\`;
        }
      } catch (err) {
        banner.innerHTML = 'Failed to run verification: ' + err.message;
      }
    }

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      event.target.classList.add('active');
    }

    function loadReplayFor(id) {
      document.getElementById('replaySessionId').value = id;
      switchTab('replay');
      runReplay();
    }

    async function runReplay() {
      const id = document.getElementById('replaySessionId').value.trim();
      if (!id) return;
      const out = document.getElementById('replayOutput');
      out.innerHTML = '<p>Reconstructing timeline...</p>';
      try {
        const res = await fetch(\`/api/v1/sessions/\${id}/timeline\`).then(r => r.json());
        if (!res.success) {
          out.innerHTML = \`<div class="alert-banner">Error: \${res.error}</div>\`;
          return;
        }
        const rep = res.data;
        out.innerHTML = \`
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
            <h4>Session Summary</h4>
            <p>Task: <strong>\${rep.initialTask || 'N/A'}</strong></p>
            <p>Status: <span class="badge \${rep.status === 'COMPLETED' ? 'success' : 'danger'}">\${rep.status}</span></p>
            <p>Duration: \${rep.durationMs}ms | Events: \${rep.totalEvents} | Executed: \${rep.totalActionsExecuted} | Blocked: \${rep.totalActionsBlocked}</p>
          </div>
          <h4>Timeline Reconstruction</h4>
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Action / Target</th><th>Decision</th><th>Result</th></tr></thead>
            <tbody>
              \${rep.timeline.map(s => \`
                <tr>
                  <td>\${s.step}</td>
                  <td>\${new Date(s.timestamp).toLocaleTimeString()}</td>
                  <td><code>\${s.eventType}</code></td>
                  <td>\${s.action || '-'} \${s.target ? '-> ' + s.target : ''}</td>
                  <td>\${s.policyDecision ? '<span class="badge">' + s.policyDecision + '</span>' : '-'}</td>
                  <td>\${s.result || '-'}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch (err) {
        out.innerHTML = '<div class="alert-banner">Failed to replay: ' + err.message + '</div>';
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}
