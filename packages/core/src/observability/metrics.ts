import { SecuritySeverity } from "../types/audit.js";

export interface LatencyHistogram {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface SecurityViolationStats {
  bySeverity: Record<SecuritySeverity, number>;
  byCategory: Record<string, number>;
  totalAlerts: number;
}

export interface OperationalMetricsSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  sessions: {
    created: number;
    completed: number;
    failed: number;
    stopped: number;
    active: number;
  };
  actions: {
    proposed: number;
    allowed: number;
    denied: number;
    executed: number;
    failed: number;
    blocked: number;
  };
  policyLatency: LatencyHistogram;
  securityViolations: SecurityViolationStats;
  system: {
    memoryUsageMb: number;
    platform: string;
    nodeVersion: string;
  };
}

export class LocalMetricsCollector {
  private startTimeMs: number;
  private sessionCounts = {
    created: 0,
    completed: 0,
    failed: 0,
    stopped: 0,
    active: 0,
  };
  private actionCounts = {
    proposed: 0,
    allowed: 0,
    denied: 0,
    executed: 0,
    failed: 0,
    blocked: 0,
  };
  private policyLatencies: number[] = [];
  private securityBySeverity: Record<SecuritySeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  private securityByCategory: Record<string, number> = {};
  private totalAlerts = 0;

  constructor() {
    this.startTimeMs = Date.now();
  }

  recordSessionEvent(stage: "created" | "completed" | "failed" | "stopped"): void {
    if (stage === "created") {
      this.sessionCounts.created++;
      this.sessionCounts.active++;
    } else {
      if (this.sessionCounts[stage] !== undefined) {
        this.sessionCounts[stage]++;
      }
      this.sessionCounts.active = Math.max(0, this.sessionCounts.active - 1);
    }
  }

  recordActionEvent(
    stage: "proposed" | "allowed" | "denied" | "executed" | "failed" | "blocked"
  ): void {
    if (this.actionCounts[stage] !== undefined) {
      this.actionCounts[stage]++;
    }
  }

  recordPolicyEvaluation(durationMs: number): void {
    this.policyLatencies.push(durationMs);
    // Maintain rolling buffer of last 5000 latencies
    if (this.policyLatencies.length > 5000) {
      this.policyLatencies.shift();
    }
  }

  recordSecurityViolation(severity: SecuritySeverity, category: string, isAlert = false): void {
    this.securityBySeverity[severity] = (this.securityBySeverity[severity] || 0) + 1;
    this.securityByCategory[category] = (this.securityByCategory[category] || 0) + 1;
    if (isAlert || severity === "HIGH" || severity === "CRITICAL") {
      this.totalAlerts++;
    }
  }

  private calculateHistogram(samples: number[]): LatencyHistogram {
    if (samples.length === 0) {
      return {
        count: 0,
        totalMs: 0,
        minMs: 0,
        maxMs: 0,
        avgMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    let totalMs = 0;
    for (const v of sorted) totalMs += v;

    const percentile = (p: number): number => {
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return Number(sorted[idx].toFixed(3));
    };

    return {
      count,
      totalMs: Number(totalMs.toFixed(3)),
      minMs: Number(sorted[0].toFixed(3)),
      maxMs: Number(sorted[count - 1].toFixed(3)),
      avgMs: Number((totalMs / count).toFixed(3)),
      p50Ms: percentile(50),
      p95Ms: percentile(95),
      p99Ms: percentile(99),
    };
  }

  getSnapshot(): OperationalMetricsSnapshot {
    const mem = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTimeMs) / 1000),
      sessions: { ...this.sessionCounts },
      actions: { ...this.actionCounts },
      policyLatency: this.calculateHistogram(this.policyLatencies),
      securityViolations: {
        bySeverity: { ...this.securityBySeverity },
        byCategory: { ...this.securityByCategory },
        totalAlerts: this.totalAlerts,
      },
      system: {
        memoryUsageMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };
  }

  exportJson(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  getHealth(): { status: "HEALTHY" | "DEGRADED" | "UNHEALTHY"; reasons: string[] } {
    const reasons: string[] = [];
    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";

    if (this.securityBySeverity.CRITICAL > 0) {
      status = "DEGRADED";
      reasons.push(`${this.securityBySeverity.CRITICAL} CRITICAL security violation(s) recorded`);
    }

    if (
      this.sessionCounts.failed > 0 &&
      this.sessionCounts.failed > this.sessionCounts.completed * 2
    ) {
      status = "DEGRADED";
      reasons.push("High failure rate in agent sessions");
    }

    return { status, reasons };
  }
}
