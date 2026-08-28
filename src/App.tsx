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

const CATEGORIES = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'league', label: 'LEAGUE' },
  { id: 'lab', label: 'LAB' },
  { id: 'data', label: 'DATA' },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const TABS = [
  { id: 'overview', label: 'OVERVIEW', category: 'overview' },
  { id: 'standings', label: 'STANDINGS', category: 'league' },
  { id: 'matches', label: 'MATCHES', category: 'league' },
  { id: 'teams', label: 'TEAMS', category: 'league' },
  { id: 'history', label: 'HISTORY', category: 'league' },
  { id: 'projection', label: 'PROJECTION', category: 'lab' },
  { id: 'whatif', label: 'WHAT-IF LAB', category: 'lab' },
  { id: 'pathfinder', label: 'PATH FINDER', category: 'lab' },
  { id: 'pathfinderplus', label: 'PATH FINDER+', category: 'lab' },
  { id: 'scenariosearch', label: 'SCENARIO SEARCH', category: 'lab' },
  { id: 'simulations', label: 'SIMULATIONS', category: 'lab' },
  { id: 'data', label: 'DATA', category: 'data' },
  { id: 'update', label: 'UPDATE DATA', category: 'data' },
  { id: 'methodology', label: 'METHODOLOGY', category: 'data' },
  { id: 'backtest', label: 'BACKTEST', category: 'data' },
  { id: 'modelweights', label: 'MODEL WEIGHTS', category: 'data' },
] as const satisfies readonly { id: string; label: string; category: CategoryId }[];

type TabId = typeof TABS[number]['id'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { league, simulation, isLoading } = useData();
  const { lang, setLang, t } = useI18n();

  // Mobile hamburger menu: closed -> category list -> tab list (drill-down).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuCategory, setMobileMenuCategory] = useState<CategoryId | null>(null);
  const closeMobileMenu = () => { setMobileMenuOpen(false); setMobileMenuCategory(null); };

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
          <button
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Menu"
          >
            ☰
          </button>
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
        {mobileMenuOpen && (
          <div className="mobile-menu-overlay" onClick={closeMobileMenu}>
            <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
              {mobileMenuCategory === null ? (
                <>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      className="mobile-menu-item"
                      onClick={() => setMobileMenuCategory(cat.id)}
                    >
                      {t(cat.label)} ›
                    </button>
                  ))}
                  <button
                    className="mobile-menu-item"
                    onClick={() => { setLang(lang === 'ko' ? 'en' : 'ko'); closeMobileMenu(); }}
                  >
                    {lang === 'ko' ? 'EN' : '한국어'}
                  </button>
                </>
              ) : (
                <>
                  <button className="mobile-menu-item mobile-menu-back" onClick={() => setMobileMenuCategory(null)}>
                    ‹ {t(CATEGORIES.find((c) => c.id === mobileMenuCategory)!.label)}
                  </button>
                  {TABS.filter((tab) => tab.category === mobileMenuCategory).map((tab) => (
                    <button
                      key={tab.id}
                      className={`mobile-menu-item ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => { setActiveTab(tab.id); closeMobileMenu(); }}
                    >
                      {t(tab.label)}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
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
