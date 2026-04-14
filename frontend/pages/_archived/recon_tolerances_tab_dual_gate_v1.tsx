/**
 * ARCHIVED: Reconciliation Tolerances Tab — Dual-gate UI (volume + percentage + cap)
 *
 * Preserved 2026-04-14. This was the UI before the mode-selector rewrite.
 * It used a dual-gate approach: volume AND percentage had to both be within limits.
 * Volume caps were added to prevent large-volume percentage abuse.
 *
 * To restore: copy the JSX block below back into settings.tsx inside the
 * {activeTab === 'recon-tolerances' && (...)} conditional.
 *
 * State shape it expects:
 *   reconTolerances = {
 *     volume_tolerance_minor: 50.0,
 *     volume_tolerance_investigation: 200.0,
 *     volume_cap_minor: 0.0,
 *     volume_cap_investigation: 0.0,
 *     percent_tolerance_minor: 0.5,
 *     percent_tolerance_investigation: 2.0,
 *     cash_tolerance_minor: 500.0,
 *     cash_tolerance_investigation: 2000.0,
 *     min_volume_for_percent: 100.0,
 *   }
 */

// ---- BEGIN ARCHIVED JSX ----

/*
      {activeTab === 'recon-tolerances' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Reconciliation Tolerances</h2>
              <p className="text-sm text-content-secondary">
                Configure tolerance thresholds for three-way reconciliation (Tank vs Nozzle vs Cash).
                A variance must stay within <strong>both</strong> the volume and percentage limits to be considered acceptable.
              </p>
            </div>

            <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-content-primary mb-2">How Reconciliation Tolerances Work</h3>
              <p className="text-sm text-content-secondary mb-3">
                Each variance is checked against two gates: a <strong>volume limit</strong> (litres) and a <strong>percentage limit</strong>.
                If <em>either</em> is exceeded, the status escalates. This produces two levels:
              </p>
              <ul className="text-sm text-content-secondary space-y-1.5 mb-3">
                <li className="flex items-start">
                  <span className="text-status-success font-bold mr-2 shrink-0">WITHIN TOLERANCE:</span>
                  <span>Volume <em>and</em> percentage are both within the minor limits.</span>
                </li>
                <li className="flex items-start">
                  <span className="text-status-warning font-bold mr-2 shrink-0">INVESTIGATE:</span>
                  <span>Exceeds minor but stays within investigation limits.</span>
                </li>
                <li className="flex items-start">
                  <span className="text-status-error font-bold mr-2 shrink-0">CRITICAL:</span>
                  <span>Exceeds investigation limits — significant loss detected.</span>
                </li>
              </ul>
              <p className="text-sm text-content-secondary">
                <strong>The problem with percentages alone:</strong> 1% of 20,000L is 200L — that is a large loss hidden behind a small percentage.
                The <strong>Volume Cap</strong> below solves this. When set, the system uses <em>whichever is smaller</em>: the configured volume tolerance or the cap.
                This ensures large-volume shifts cannot silently absorb big absolute losses just because the percentage looks small.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-content-primary mb-3">Volume Tolerances (Liters)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Minor (L)</label>
                  <input type="number" step="1" min="0" max="10000"
                    value={reconTolerances.volume_tolerance_minor}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, volume_tolerance_minor: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary" required />
                  <p className="text-xs text-content-secondary mt-1">Variance up to this many litres is acceptable</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (L)</label>
                  <input type="number" step="1" min="0" max="50000"
                    value={reconTolerances.volume_tolerance_investigation}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, volume_tolerance_investigation: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary" required />
                  <p className="text-xs text-content-secondary mt-1">Above minor but within this = requires investigation</p>
                </div>
              </div>
            </div>

            <div className="bg-status-warning/5 border border-status-warning/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-content-primary mb-1">Maximum Volume Cap (Liters)</h3>
              <p className="text-xs text-content-secondary mb-3">
                Caps the maximum tolerable loss in litres, regardless of the percentage or volume tolerance above.
                When set, the system uses whichever is smaller: the volume tolerance or this cap.
                Set to 0 to disable the cap.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Cap — Minor (L)</label>
                  <input type="number" step="0.5" min="0" max="10000"
                    value={reconTolerances.volume_cap_minor}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, volume_cap_minor: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-warning/50 rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">
                    {reconTolerances.volume_cap_minor > 0
                      ? `Active — no more than ${reconTolerances.volume_cap_minor}L loss passes as acceptable`
                      : 'Disabled (0) — volume tolerance applies without a cap'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Cap — Investigation (L)</label>
                  <input type="number" step="0.5" min="0" max="50000"
                    value={reconTolerances.volume_cap_investigation}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, volume_cap_investigation: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-warning/50 rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">
                    {reconTolerances.volume_cap_investigation > 0
                      ? `Active — above ${reconTolerances.volume_cap_minor > 0 ? reconTolerances.volume_cap_minor + 'L' : 'minor'} but within ${reconTolerances.volume_cap_investigation}L = investigate`
                      : 'Disabled (0) — investigation volume tolerance applies without a cap'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-content-primary mb-3">Percentage Tolerances (%)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Minor (%)</label>
                  <input type="number" step="0.1" min="0" max="100"
                    value={reconTolerances.percent_tolerance_minor}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_minor: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">
                    Up to this % = acceptable
                    <span className="ml-1 text-content-tertiary">
                      — e.g. {((reconTolerances.percent_tolerance_minor / 100) * 20000).toFixed(0)}L on 20,000L
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (%)</label>
                  <input type="number" step="0.1" min="0" max="100"
                    value={reconTolerances.percent_tolerance_investigation}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_investigation: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">
                    Above minor %, up to this = investigate
                    <span className="ml-1 text-content-tertiary">
                      — e.g. {((reconTolerances.percent_tolerance_investigation / 100) * 20000).toFixed(0)}L on 20,000L
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-content-primary mb-3">Cash Tolerances (ZMW)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Minor (ZMW)</label>
                  <input type="number" step="10" min="0" max="1000000"
                    value={reconTolerances.cash_tolerance_minor}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, cash_tolerance_minor: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">Cash variance up to this = acceptable</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (ZMW)</label>
                  <input type="number" step="10" min="0" max="1000000"
                    value={reconTolerances.cash_tolerance_investigation}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, cash_tolerance_investigation: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">Above minor but within this = investigate</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Minimum Volume for % Calculation (L)</label>
              <input type="number" step="10" min="0" max="10000"
                value={reconTolerances.min_volume_for_percent}
                onChange={(e) => setReconTolerances({ ...reconTolerances, min_volume_for_percent: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-surface-border rounded-md max-w-xs" required />
              <p className="text-xs text-content-secondary mt-1">Percentage variance is not calculated for volumes below this</p>
            </div>

            {reconMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {reconMessage}</p>
              </div>
            )}
            {reconError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {reconError}</p>
              </div>
            )}

            <button onClick={updateReconTolerances} disabled={reconLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover disabled:opacity-50 disabled:cursor-not-allowed">
              {reconLoading ? 'Saving...' : 'Save Reconciliation Tolerances'}
            </button>

            <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-content-primary mb-2">Reconciliation Levels</h3>
              <ul className="text-sm text-content-secondary space-y-2">
                <li><span className="text-status-success font-bold mr-2">BALANCED:</span>All three sources match within minor tolerance</li>
                <li><span className="text-status-warning font-bold mr-2">MINOR:</span>Small discrepancy within acceptable range</li>
                <li><span className="text-status-warning font-bold mr-2">INVESTIGATION:</span>Between minor and investigation threshold</li>
                <li><span className="text-status-error font-bold mr-2">CRITICAL:</span>Above investigation threshold</li>
              </ul>
            </div>
          </div>
        </div>
      )}
*/

// ---- END ARCHIVED JSX ----
