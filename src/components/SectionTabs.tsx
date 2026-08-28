import { useState, type ReactNode } from 'react';

interface Section {
  id: string;
  label: string;
  content: ReactNode;
}

// Mobile-only tab switcher: on desktop all sections render stacked as before
// (nav hidden via CSS), on narrow screens only the active section shows.
export function SectionTabs({ sections, className = '' }: { sections: Section[]; className?: string }) {
  const [active, setActive] = useState(sections[0]?.id);
  return (
    <div className={className}>
      <div className="section-tabs-nav">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`btn btn-sm ${active === s.id ? 'active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.id} className={`section-tabs-panel ${active === s.id ? 'active' : ''}`}>
          {s.content}
        </div>
      ))}
    </div>
  );
}
