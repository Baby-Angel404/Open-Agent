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
    <button class="tab-btn" onclick="switchTab('rag')">RAG Explorer</button>
    <button class="tab-btn" onclick="switchTab('graph')">Graph Explorer</button>
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

  <div id="tab-rag" class="view-panel card">
    <h3>Local Hybrid Retrieval & Collections</h3>
    <div style="margin: 12px 0;">
      <h4>Registered Collections</h4>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Dimension</th>
            <th>Distance Metric</th>
            <th>Records</th>
            <th>Documents</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody id="ragCollectionsBody">
          <tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Loading collections...</td></tr>
        </tbody>
      </table>
    </div>

    <div style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px;">
      <h4>Hybrid Retrieval Query Tester</h4>
      <div style="display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap;">
        <input type="text" id="ragSearchCol" placeholder="Collection name" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); width: 180px;">
        <input type="text" id="ragSearchQuery" placeholder="Search query text..." style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); flex: 1; min-width: 240px;">
        <select id="ragSearchMode" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border);">
          <option value="hybrid">Mode: Hybrid</option>
          <option value="dense">Mode: Dense Only</option>
          <option value="sparse">Mode: Sparse Only (BM25)</option>
        </select>
        <input type="number" id="ragSearchTopK" value="5" min="1" max="50" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); width: 70px;">
        <button class="action-btn" onclick="runRagSearch()">Search</button>
      </div>
      <div id="ragSearchResults" style="margin-top: 12px;"></div>
    </div>
  </div>

  <div id="tab-graph" class="view-panel card">
    <h3>Local Knowledge Graph & Graph RAG Explorer</h3>
    
    <div style="display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap;">
      <input type="text" id="graphSearchInput" placeholder="Filter entities by name..." style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); flex: 1; min-width: 200px;">
      <select id="graphTypeFilter" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border);">
        <option value="">All Types</option>
        <option value="TECHNOLOGY">Technology</option>
        <option value="CONCEPT">Concept</option>
        <option value="ORGANIZATION">Organization</option>
        <option value="PRODUCT">Product</option>
        <option value="PERSON">Person</option>
      </select>
      <button class="action-btn" onclick="loadGraphEntities()">Filter Entities</button>
      <button class="action-btn" style="background: var(--warning); color: #000;" onclick="verifyGraphIntegrity()">Verify Consistency</button>
    </div>

    <div id="graphVerifyResult" style="display: none; margin-bottom: 12px;"></div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;">
      <div>
        <h4>Known Graph Entities</h4>
        <table>
          <thead>
            <tr>
              <th>Canonical Name</th>
              <th>Type</th>
              <th>Aliases</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="graphEntitiesBody">
            <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Loading entities...</td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <h4>Neighborhood & Evidence Traversal</h4>
        <div id="traversalControls" style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
          <input type="text" id="traverseEntityId" placeholder="Selected Entity ID" readonly style="padding: 6px 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); flex: 1;">
          <select id="traverseDepth" style="padding: 6px 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border);">
            <option value="1">Depth 1</option>
            <option value="2" selected>Depth 2</option>
            <option value="3">Depth 3</option>
          </select>
          <button class="action-btn" style="padding: 6px 12px;" onclick="runEntityTraversal()">Traverse</button>
        </div>
        <div id="traversalResultBox" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; min-height: 180px;">
          <p style="color: var(--text-muted);">Select an entity on the left to inspect graph connections and evidence provenance.</p>
        </div>
      </div>
    </div>

    <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
      <h4>Grounded Graph RAG Query Tester</h4>
      <div style="display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap;">
        <input type="text" id="graphRagQuery" placeholder="Ask question grounded by Knowledge Graph..." style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); flex: 1; min-width: 250px;">
        <input type="text" id="graphRagCollection" placeholder="Vector collection (optional)" style="padding: 8px; border-radius: 6px; background: #000; color: #fff; border: 1px solid var(--border); width: 180px;">
        <label style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 0.85rem;">
          <input type="checkbox" id="graphRagUseGraph" checked> Use Graph Expansion
        </label>
        <button class="action-btn" onclick="runGraphRagQuery()">Ask Graph RAG</button>
      </div>
      <div id="graphRagAnswerBox" style="margin-top: 12px;"></div>
    </div>
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

    async function loadRagCollections() {
      try {
        const res = await fetch('/api/v1/collections').then(r => r.json());
        const tbody = document.getElementById('ragCollectionsBody');
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          tbody.innerHTML = res.data.map(c => \`
            <tr>
              <td><code>\${c.name}</code></td>
              <td>\${c.dimension}</td>
              <td>\${c.distanceMetric}</td>
              <td>\${c.recordCount}</td>
              <td>\${c.documentCount}</td>
              <td>\${new Date(c.createdAt).toLocaleTimeString()}</td>
            </tr>
          \`).join('');
          const colInput = document.getElementById('ragSearchCol');
          if (colInput && !colInput.value && res.data.length > 0) {
            colInput.value = res.data[0].name;
          }
        } else {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No collections found. Create one via CLI or API.</td></tr>';
        }
      } catch (err) {
        console.error('Failed to load collections', err);
      }
    }

    async function runRagSearch() {
      const col = document.getElementById('ragSearchCol').value.trim();
      const q = document.getElementById('ragSearchQuery').value.trim();
      const mode = document.getElementById('ragSearchMode').value;
      const topK = parseInt(document.getElementById('ragSearchTopK').value, 10) || 5;
      const out = document.getElementById('ragSearchResults');
      if (!col || !q) {
        out.innerHTML = '<div class="alert-banner">Please specify collection and query text</div>';
        return;
      }
      out.innerHTML = '<p style="color: var(--text-muted);">Executing ' + mode + ' search...</p>';
      try {
        const res = await fetch('/api/v1/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: col, query: q, mode: mode, topK: topK })
        }).then(r => r.json());

        if (!res.success) {
          out.innerHTML = \`<div class="alert-banner">Error: \${res.error?.message || JSON.stringify(res.error)}</div>\`;
          return;
        }

        const hits = res.data?.results || [];
        if (hits.length === 0) {
          out.innerHTML = '<p style="color: var(--text-muted); margin-top: 8px;">No matching records found.</p>';
          return;
        }

        out.innerHTML = \`
          <div style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-muted);">Retrieved \${hits.length} items in \${res.data.timingMs.toFixed(2)}ms</div>
          <table>
            <thead>
              <tr>
                <th>Score</th>
                <th>Dense / Sparse</th>
                <th>Record ID</th>
                <th>Document / Chunk</th>
                <th>Content Snippet</th>
              </tr>
            </thead>
            <tbody>
              \${hits.map(h => \`
                <tr>
                  <td><strong>\${h.score.toFixed(4)}</strong></td>
                  <td>\${h.denseScore !== undefined ? h.denseScore.toFixed(3) : '-'} / \${h.sparseScore !== undefined ? h.sparseScore.toFixed(3) : '-'}</td>
                  <td><code>\${h.id}</code></td>
                  <td><code>\${h.documentId || '-'} / \${h.chunkId !== undefined ? h.chunkId : '-'}</code></td>
                  <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${h.content}">\${h.content}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch (err) {
        out.innerHTML = '<div class="alert-banner">Search request failed: ' + err.message + '</div>';
      }
    }

    async function loadGraphEntities() {
      const q = document.getElementById('graphSearchInput').value.trim();
      const type = document.getElementById('graphTypeFilter').value;
      const tbody = document.getElementById('graphEntitiesBody');
      try {
        let url = '/api/v1/graph/entities?limit=50';
        if (q) url += '&query=' + encodeURIComponent(q);
        if (type) url += '&type=' + encodeURIComponent(type);
        const res = await fetch(url).then(r => r.json());
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          tbody.innerHTML = res.data.map(e => \`
            <tr>
              <td><strong>\${e.canonical_name}</strong></td>
              <td><span class="badge">\${e.entity_type}</span></td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">\${(e.aliases || []).join(', ') || '-'}</td>
              <td>
                <button class="action-btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="selectEntityForTraversal('\${e.id}', '\${e.canonical_name}')">Inspect</button>
              </td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No entities found. Ingest documents to extract graph elements.</td></tr>';
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Failed to load entities: ' + err.message + '</td></tr>';
      }
    }

    function selectEntityForTraversal(id, name) {
      document.getElementById('traverseEntityId').value = id;
      runEntityTraversal();
    }

    async function runEntityTraversal() {
      const id = document.getElementById('traverseEntityId').value.trim();
      const depth = parseInt(document.getElementById('traverseDepth').value, 10) || 1;
      const out = document.getElementById('traversalResultBox');
      if (!id) {
        out.innerHTML = '<p style="color: var(--warning);">Please select an entity first.</p>';
        return;
      }
      out.innerHTML = '<p style="color: var(--text-muted);">Traversing neighborhood for entity ' + id + '...</p>';
      try {
        const res = await fetch(\`/api/v1/graph/entities/\${id}/neighbors?depth=\${depth}\`).then(r => r.json());
        if (!res.success) {
          out.innerHTML = \`<div class="alert-banner">Error: \${res.error?.message || JSON.stringify(res.error)}</div>\`;
          return;
        }
        const data = res.data;
        out.innerHTML = \`
          <div style="font-size: 0.85rem; margin-bottom: 8px;">
            Target: <strong>\${data.targetEntity?.canonical_name || id}</strong> (\${data.targetEntity?.entity_type || 'ENTITY'})
            | Connected Entities: \${data.entities?.length || 0}
            | Relationships: \${data.relationships?.length || 0}
          </div>
          <div style="margin-top: 8px;">
            <strong>Relationships:</strong>
            <ul style="padding-left: 18px; margin: 4px 0; font-size: 0.85rem;">
              \${(data.relationships || []).map(r => \`
                <li><code>\${r.predicate}</code> -> <strong>\${r.object_id}</strong> (conf: \${r.confidence})</li>
              \`).join('') || '<li style="color: var(--text-muted);">No outgoing/incoming relationships at this depth.</li>'}
            </ul>
          </div>
        \`;
      } catch (err) {
        out.innerHTML = '<div class="alert-banner">Failed to traverse graph: ' + err.message + '</div>';
      }
    }

    async function verifyGraphIntegrity() {
      const banner = document.getElementById('graphVerifyResult');
      banner.style.display = 'block';
      banner.className = 'alert-banner';
      banner.innerHTML = 'Verifying Knowledge Graph consistency...';
      try {
        const res = await fetch('/api/v1/graph/verify', { method: 'POST' }).then(r => r.json());
        if (res.success && res.data.valid) {
          banner.style.borderColor = 'var(--success)';
          banner.style.background = 'rgba(16, 185, 129, 0.1)';
          banner.style.color = '#6ee7b7';
          banner.innerHTML = \`✓ Knowledge Graph Consistent: \${res.data.checkedEntities} entities and \${res.data.checkedRelationships} relationships verified with zero anomalies.\`;
        } else {
          banner.style.borderColor = 'var(--danger)';
          banner.style.background = 'rgba(239, 68, 68, 0.1)';
          banner.style.color = '#fca5a5';
          banner.innerHTML = \`✗ Graph Integrity Issues Found: \${(res.data?.issues || []).join(', ') || 'Anomalies detected'}\`;
        }
      } catch (err) {
        banner.innerHTML = 'Failed to verify graph: ' + err.message;
      }
    }

    async function runGraphRagQuery() {
      const q = document.getElementById('graphRagQuery').value.trim();
      const col = document.getElementById('graphRagCollection').value.trim();
      const useGraph = document.getElementById('graphRagUseGraph').checked;
      const out = document.getElementById('graphRagAnswerBox');
      if (!q) {
        out.innerHTML = '<div class="alert-banner">Please enter a question to query.</div>';
        return;
      }
      out.innerHTML = '<p style="color: var(--text-muted);">Synthesizing grounded answer via Graph RAG...</p>';
      try {
        const res = await fetch('/api/v1/rag/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            collection: col || undefined,
            expandGraph: useGraph,
            maxDepth: 2,
            topK: 5
          })
        }).then(r => r.json());

        if (!res.success) {
          out.innerHTML = \`<div class="alert-banner">Error: \${res.error?.message || JSON.stringify(res.error)}</div>\`;
          return;
        }

        const ans = res.data;
        out.innerHTML = \`
          <div style="background: rgba(0,0,0,0.3); border-left: 3px solid var(--accent); padding: 12px; border-radius: 6px; margin-top: 8px;">
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Answer:</div>
            <div style="line-height: 1.5; color: var(--text-main);">\${ans.answer}</div>
            <div style="margin-top: 10px; font-size: 0.8rem; color: var(--text-muted);">
              Confidence: \${(ans.confidence * 100).toFixed(0)}% | Entities Used: \${ans.context?.entities?.length || 0} | Relationships: \${ans.context?.relationships?.length || 0}
            </div>
            \${(ans.citations && ans.citations.length > 0) ? \`
              <div style="margin-top: 8px; font-size: 0.8rem;">
                <strong>Citations:</strong>
                <ul style="padding-left: 18px; margin: 4px 0; color: var(--text-muted);">
                  \${ans.citations.map(c => \`<li><code>\${c.documentId}</code> (chunk \${c.chunkId}): \${c.snippet}</li>\`).join('')}
                </ul>
              </div>
            \` : ''}
          </div>
        \`;
      } catch (err) {
        out.innerHTML = '<div class="alert-banner">Graph RAG query failed: ' + err.message + '</div>';
      }
    }

    loadData();
    loadRagCollections();
    loadGraphEntities();
    setInterval(() => {
      loadData();
      loadRagCollections();
      loadGraphEntities();
    }, 5000);
  </script>
</body>
</html>`;
}
