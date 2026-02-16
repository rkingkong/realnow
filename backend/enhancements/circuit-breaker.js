// ============================================================================
// circuit-breaker.js — Circuit Breaker Pattern for Data Sources
// Drop into: /var/www/realnow/backend/enhancements/circuit-breaker.js
// ============================================================================
// 
// After 3 consecutive failures, the circuit "opens" and stops hitting the
// upstream API. After a backoff period (starting at 30s, doubling each time
// up to 10 min), it allows one "probe" request. If that succeeds, the
// circuit closes and normal operation resumes.
// ============================================================================

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutBase = options.resetTimeoutBase || 30000;   // 30s
    this.maxResetTimeout  = options.maxResetTimeout  || 600000;  // 10 min
    this.circuits = new Map();
  }

  _getCircuit(name) {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, {
        state: 'CLOSED',       // CLOSED | OPEN | HALF_OPEN
        failures: 0,
        lastFailure: null,
        resetTimeout: this.resetTimeoutBase,
        successCount: 0,
        totalFailures: 0
      });
    }
    return this.circuits.get(name);
  }

  /**
   * Check if a request to this source should be allowed.
   * Returns { allowed: boolean, reason: string }
   */
  canRequest(name) {
    const circuit = this._getCircuit(name);

    if (circuit.state === 'CLOSED') {
      return { allowed: true, reason: 'circuit closed' };
    }

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.lastFailure;
      if (elapsed >= circuit.resetTimeout) {
        // Allow a probe
        circuit.state = 'HALF_OPEN';
        console.log(`⚡ [CircuitBreaker] ${name}: HALF_OPEN — allowing probe request`);
        return { allowed: true, reason: 'probe request' };
      }
      const waitSec = Math.round((circuit.resetTimeout - elapsed) / 1000);
      return { allowed: false, reason: `circuit open, retry in ${waitSec}s` };
    }

    // HALF_OPEN — allow the probe
    return { allowed: true, reason: 'half-open probe' };
  }

  /**
   * Record a successful request.
   */
  onSuccess(name) {
    const circuit = this._getCircuit(name);
    circuit.failures = 0;
    circuit.successCount++;
    if (circuit.state !== 'CLOSED') {
      console.log(`✅ [CircuitBreaker] ${name}: CLOSED — source recovered`);
      circuit.state = 'CLOSED';
      circuit.resetTimeout = this.resetTimeoutBase; // reset backoff
    }
  }

  /**
   * Record a failed request.
   */
  onFailure(name) {
    const circuit = this._getCircuit(name);
    circuit.failures++;
    circuit.totalFailures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      // Probe failed — back to OPEN with doubled timeout
      circuit.state = 'OPEN';
      circuit.resetTimeout = Math.min(circuit.resetTimeout * 2, this.maxResetTimeout);
      console.log(`🔴 [CircuitBreaker] ${name}: OPEN — probe failed, next retry in ${Math.round(circuit.resetTimeout / 1000)}s`);
      return;
    }

    if (circuit.failures >= this.failureThreshold) {
      circuit.state = 'OPEN';
      console.log(`🔴 [CircuitBreaker] ${name}: OPEN — ${circuit.failures} consecutive failures`);
    }
  }

  /**
   * Get status of all circuits (for /health endpoint).
   */
  getStatus() {
    const status = {};
    for (const [name, circuit] of this.circuits) {
      status[name] = {
        state: circuit.state,
        consecutiveFailures: circuit.failures,
        totalFailures: circuit.totalFailures,
        totalSuccesses: circuit.successCount,
        ...(circuit.state === 'OPEN' ? {
          retriesIn: Math.max(0, Math.round((circuit.resetTimeout - (Date.now() - circuit.lastFailure)) / 1000)) + 's'
        } : {})
      };
    }
    return status;
  }
}

module.exports = CircuitBreaker;