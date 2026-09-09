import { useMemo, useRef, useState } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import type { MatchStatus } from '../types/index.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export default function AdminUpdate() {
  // Always edits the real data — the time machine view (if active elsewhere)
  // must never silently hide matches from the admin editor.
  const {
    league, teams, realMatches: matches, usingLocalData, updateMatch, resetLocalData, exportLocalData, importLocalData,
    usingExternalDataset, loadExternalDataset, clearExternalDataset,
  } = useData();
  const { t, lang } = useI18n();

  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasetUrl, setDatasetUrl] = useState('');
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [showDatasetModal, setShowDatasetModal] = useState(false);

  const rounds = useMemo(
    () => Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b),
    [matches]
  );

  const visibleMatches = useMemo(() => {
    const filtered = selectedRound === null ? matches : matches.filter((m) => m.round === selectedRound);
    return [...filtered].sort((a, b) => a.round - b.round);
  }, [matches, selectedRound]);

  const handleComplete = (matchId: string) => {
    const input = scoreInputs[matchId];
    const home = Number(input?.home);
    const away = Number(input?.away);
    if (!input || !Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) return;
    updateMatch(matchId, { status: 'completed', homeScore: home, awayScore: away });
  };

  const setStatus = (matchId: string, status: MatchStatus) => {
    updateMatch(matchId, { status, homeScore: null, awayScore: null });
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importLocalData(file);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t('Failed to import file.'));
    }
  };

  const handleReset = () => {
    if (confirm(t('Discard the local override and go back to the data baked into this build?'))) {
      resetLocalData();
    }
  };

  const handleLoadDataset = async () => {
    if (!datasetUrl.trim()) return;
    setDatasetLoading(true);
    setDatasetError(null);
    try {
      await loadExternalDataset(datasetUrl.trim());
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : t('Failed to load dataset.'));
    } finally {
      setDatasetLoading(false);
    }
  };

  const handleClearDataset = () => {
    if (confirm(t('Drop the external dataset and go back to this site\'s own league?'))) {
      clearExternalDataset();
      setDatasetError(null);
    }
  };

  return (
    <div className="page">
      <h2>{t('UPDATE DATA')}</h2>

      <div className="panel full-width">
        <h3>{t('DATA SOURCE')}</h3>
        <div className="scenario-instructions">
          {t("This is a static site with no backend — an admin who can't push a code update can instead enter results here. Changes save to this browser only (localStorage). Export a save file to hand the update to someone else, or to load it back later / in another browser.")}
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Currently showing')}</span>
          <span className={`stat-value ${usingLocalData ? 'accent' : ''}`}>
            {usingLocalData ? t('LOCAL OVERRIDE (this browser)') : t('DEFAULT (baked into build)')}
          </span>
        </div>
        <div className="override-buttons" style={{ marginTop: 6 }}>
          <button className="btn btn-sm btn-set" onClick={exportLocalData}>{t('EXPORT SAVE FILE')}</button>
          <button className="btn btn-sm" onClick={handleImportClick}>{t('IMPORT SAVE FILE')}</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleFileChange} />
          {usingLocalData && (
            <button className="btn btn-sm btn-remove" onClick={handleReset}>{t('RESET TO DEFAULT')}</button>
          )}
        </div>
        {importError && <div className="mathematical-note" style={{ color: 'var(--red)' }}>{importError}</div>}
      </div>

      <div className="panel full-width" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}>⚠ {t('LOAD EXTERNAL DATASET (EXPERIMENTAL)')}</h3>
        <div className="scenario-instructions">
          {t('Replaces the entire league — teams, rules, matches — with a JSON file fetched from a URL, so a completely different league can be simulated instead of just entering results for this one. The URL must point to one JSON file shaped { league, teams, matches } and allow cross-origin requests (CORS); a raw.githubusercontent.com link usually works.')}
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Currently showing')}</span>
          <span className={`stat-value ${usingExternalDataset ? 'accent' : ''}`}>
            {usingExternalDataset ? `${t('EXTERNAL DATASET')}: ${league.name}` : t('THIS SITE\'S OWN LEAGUE')}
          </span>
        </div>
        <div className="scenario-create" style={{ marginTop: 6 }}>
          <input
            type="text"
            className="input-field"
            value={datasetUrl}
            onChange={(e) => setDatasetUrl(e.target.value)}
            placeholder={t('https://.../dataset.json')}
          />
          <button className="btn btn-primary" disabled={!datasetUrl.trim() || datasetLoading} onClick={() => setShowDatasetModal(true)}>
            {datasetLoading ? t('LOADING...') : t('LOAD')}
          </button>
        </div>
        {usingExternalDataset && (
          <button className="btn btn-sm btn-remove" style={{ marginTop: 6 }} onClick={handleClearDataset}>{t('BACK TO OWN LEAGUE')}</button>
        )}
        {datasetError && <div className="mathematical-note" style={{ color: 'var(--red)' }}>{datasetError}</div>}
      </div>

      {showDatasetModal && (
        <div className="modal-overlay" onClick={() => setShowDatasetModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--red)' }}>⚠ {t('EXPERIMENTAL FEATURE')}</h3>
            <p className="path-description">
              {t('This replaces every team, rule, and match on the site with whatever this URL returns — none of it is validated beyond basic shape checks. Only load a URL you trust. This only changes what this browser shows (localStorage); nothing is uploaded anywhere.')}
            </p>
            <div className="override-buttons" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setShowDatasetModal(false)}>{t('CANCEL')}</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => { setShowDatasetModal(false); handleLoadDataset(); }}
              >
                {t('LOAD IT')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel full-width">
        <h3>{t('EDIT MATCHES')}</h3>
        <div className="round-filter">
          <button className={`btn btn-sm ${selectedRound === null ? 'active' : ''}`} onClick={() => setSelectedRound(null)}>{t('ALL')}</button>
          {rounds.map((r) => (
            <button key={r} className={`btn btn-sm ${selectedRound === r ? 'active' : ''}`} onClick={() => setSelectedRound(r)}>R{r}</button>
          ))}
        </div>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('R')}</th>
              <th>{t('Home')}</th>
              <th>{t('Score')}</th>
              <th>{t('Away')}</th>
              <th>{t('Status')}</th>
              <th>{t('Set Result')}</th>
              <th>{t('Other')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatches.map((m) => {
              const isTargetMatch = m.homeTeamId === league.targetTeamId || m.awayTeamId === league.targetTeamId;
              return (
                <tr key={m.id} className={isTargetMatch ? 'target-row' : ''}>
                  <td>{m.round}</td>
                  <td className={m.homeTeamId === league.targetTeamId ? 'target-text' : ''}>{getTeamName(teams, m.homeTeamId, lang)}</td>
                  <td className="score-cell">
                    {m.status === 'completed' ? `${m.homeScore} - ${m.awayScore}` : t('vs')}
                  </td>
                  <td className={m.awayTeamId === league.targetTeamId ? 'target-text' : ''}>{getTeamName(teams, m.awayTeamId, lang)}</td>
                  <td>
                    <span className={`badge badge-${m.status === 'completed' ? 'low-impact' : m.status === 'postponed' ? 'medium' : 'low'}`}>
                      {t(m.status)}
                    </span>
                  </td>
                  <td>
                    <div className="score-input-group">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={scoreInputs[m.id]?.home ?? ''}
                        onChange={(e) => setScoreInputs((prev) => ({ ...prev, [m.id]: { home: e.target.value, away: prev[m.id]?.away ?? '' } }))}
                        className="score-input"
                        placeholder="H"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={scoreInputs[m.id]?.away ?? ''}
                        onChange={(e) => setScoreInputs((prev) => ({ ...prev, [m.id]: { home: prev[m.id]?.home ?? '', away: e.target.value } }))}
                        className="score-input"
                        placeholder="A"
                      />
                      <button className="btn btn-sm btn-set" onClick={() => handleComplete(m.id)}>{t('SET')}</button>
                    </div>
                  </td>
                  <td>
                    <div className="override-buttons compact">
                      <button className="btn btn-xs" onClick={() => setStatus(m.id, 'scheduled')}>{t('SCHEDULED')}</button>
                      <button className="btn btn-xs" onClick={() => setStatus(m.id, 'postponed')}>{t('POSTPONE')}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
