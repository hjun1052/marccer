import { useState } from 'react'
import { useData } from './hooks/useData'
import { useI18n } from './i18n/I18nContext.tsx'
import './App.css'

import Overview from './pages/Overview'
import Standings from './pages/Standings'
import Matches from './pages/Matches'
import Teams from './pages/Teams'
import Projection from './pages/Projection'
import WhatIfLab from './pages/WhatIfLab'
import PathFinder from './pages/PathFinder'
import PathFinderPlus from './pages/PathFinderPlus'
import ScenarioSearch from './pages/ScenarioSearch'
import Simulations from './pages/Simulations'
import History from './pages/History'
import Data from './pages/Data'
import AdminUpdate from './pages/AdminUpdate'
import Methodology from './pages/Methodology'
import Backtest from './pages/Backtest'
import ModelWeights from './pages/ModelWeights'

const TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'standings', label: 'STANDINGS' },
  { id: 'matches', label: 'MATCHES' },
  { id: 'teams', label: 'TEAMS' },
  { id: 'projection', label: 'PROJECTION' },
  { id: 'whatif', label: 'WHAT-IF LAB' },
  { id: 'pathfinder', label: 'PATH FINDER' },
  { id: 'pathfinderplus', label: 'PATH FINDER+' },
  { id: 'scenariosearch', label: 'SCENARIO SEARCH' },
  { id: 'simulations', label: 'SIMULATIONS' },
  { id: 'history', label: 'HISTORY' },
  { id: 'data', label: 'DATA' },
  { id: 'update', label: 'UPDATE DATA' },
  { id: 'methodology', label: 'METHODOLOGY' },
  { id: 'backtest', label: 'BACKTEST' },
  { id: 'modelweights', label: 'MODEL WEIGHTS' },
] as const;

type TabId = typeof TABS[number]['id'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { league, simulation, isLoading } = useData();
  const { lang, setLang, t } = useI18n();

  const renderPage = () => {
    switch (activeTab) {
      case 'overview': return <Overview />;
      case 'standings': return <Standings />;
      case 'matches': return <Matches />;
      case 'teams': return <Teams />;
      case 'projection': return <Projection />;
      case 'whatif': return <WhatIfLab />;
      case 'pathfinder': return <PathFinder />;
      case 'pathfinderplus': return <PathFinderPlus />;
      case 'scenariosearch': return <ScenarioSearch />;
      case 'simulations': return <Simulations />;
      case 'history': return <History />;
      case 'data': return <Data />;
      case 'update': return <AdminUpdate />;
      case 'methodology': return <Methodology />;
      case 'backtest': return <Backtest />;
      case 'modelweights': return <ModelWeights />;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-name">marccer</span>
          <span className="app-league">{lang === 'en' ? (league.nameEn ?? league.name) : league.name}</span>
          <span className="app-season">{lang === 'en' ? (league.seasonNameEn ?? league.seasonName) : league.seasonName}</span>
        </div>
        <nav className="tab-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.label)}
            </button>
          ))}
          <button
            className="tab-btn lang-toggle"
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            title="Switch language"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
        </nav>
        <div className="app-meta">
          <span>{t('Data')}: {league.dataVersion}</span>
          <span>{t('Model')}: {league.modelVersion}</span>
          <span>{t('Sims')}: {simulation?.config.count.toLocaleString() ?? '-'}</span>
          <span>{t('Updated')}: {league.lastDataUpdate}</span>
          {isLoading && <span className="loading-indicator">{t('COMPUTING...')}</span>}
        </div>
      </header>
      <main className="app-main">
        {renderPage()}
      </main>
    </div>
  );
}

export default App
