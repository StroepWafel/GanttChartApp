import { useState, useRef, useEffect } from 'react';
import type { StatisticsPreferences } from '../api';
import { COUNTRIES } from '../countries';
import './StatisticsPrompt.css';

interface Props {
  onConfirm: (preferences: StatisticsPreferences) => void;
  onNotNow: () => void;
}

export default function StatisticsPrompt({ onConfirm, onNotNow }: Props) {
  const [environment, setEnvironment] = useState(false);
  const [usageCounts, setUsageCounts] = useState(false);
  const [shareCountry, setShareCountry] = useState(false);
  const [country, setCountry] = useState('');
  const [serverId, setServerId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  function buildPreferences(): StatisticsPreferences {
    const prefs: StatisticsPreferences = {};
    if (environment) prefs.environment = true;
    if (usageCounts) prefs.usageCounts = true;
    if (serverId) prefs.serverId = true;
    if (shareCountry && country && country !== '') {
      prefs.country = country;
    } else {
      prefs.country = null;
    }
    return prefs;
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm(buildPreferences());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onNotNow}>
      <div className="modal statistics-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Help us improve</h3>
        <p className="statistics-prompt-message">
          Would you like to share anonymous usage statistics? Choose which data you&apos;re comfortable sharing. This is optional.
        </p>
        <div className="statistics-prompt-options" role="group" aria-labelledby="statistics-options-heading">
          <p id="statistics-options-heading" className="sr-only">Statistics collection options</p>
          <label className="statistics-prompt-checkbox">
            <input
              type="checkbox"
              checked={environment}
              onChange={(e) => setEnvironment(e.target.checked)}
              aria-describedby="statistics-env-desc"
            />
            <span id="statistics-env-desc">Share environment info (OS, Node.js version, system architecture)</span>
          </label>
          <label className="statistics-prompt-checkbox">
            <input
              type="checkbox"
              checked={usageCounts}
              onChange={(e) => setUsageCounts(e.target.checked)}
              aria-describedby="statistics-usage-desc"
            />
            <span id="statistics-usage-desc">Share usage counts (number of users, projects, tasks)</span>
          </label>
          <label className="statistics-prompt-checkbox">
            <input
              type="checkbox"
              checked={shareCountry}
              onChange={(e) => setShareCountry(e.target.checked)}
              aria-describedby="statistics-country-desc"
            />
            <span id="statistics-country-desc">Share country</span>
          </label>
          {shareCountry && (
            <div className="statistics-prompt-country-row">
              <label htmlFor="statistics-country" className="statistics-prompt-country-label">
                Country
              </label>
              <select
                id="statistics-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="statistics-prompt-select"
                aria-label="Select country"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code || 'empty'} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="statistics-prompt-checkbox">
            <input
              type="checkbox"
              checked={serverId}
              onChange={(e) => setServerId(e.target.checked)}
              aria-describedby="statistics-serverid-desc"
            />
            <span id="statistics-serverid-desc">
              Include installation ID (helps track updates without double-counting installations)
            </span>
          </label>
        </div>
        {error && <p className="statistics-prompt-error">{error}</p>}
        <div className="statistics-prompt-actions">
          <button type="button" className="btn-sm" onClick={onNotNow} ref={firstFocusRef}>
            Not now
          </button>
          <button
            type="button"
            className="btn-sm btn-sm-primary"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
