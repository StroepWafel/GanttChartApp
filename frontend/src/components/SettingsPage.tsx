import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import './SettingsPage.css';

export type SettingsTab = 'personal' | 'app' | 'spaces' | 'admin' | 'status' | 'emailOnboarding' | 'updates' | 'danger';

interface Section {
  id: SettingsTab;
  label: string;
  show?: boolean;
}

interface Props {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  sections: Section[];
  children: React.ReactNode;
}

export default function SettingsPage({ tab, onTabChange, sections, children }: Props) {
  const { isMobile } = useMediaQuery();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  useEffect(() => {
    if (!isMobile) setSidebarOpen(true);
  }, [isMobile]);

  const visibleSections = sections.filter((s) => s.show !== false);

  const handleSectionClick = (id: SettingsTab) => {
    onTabChange(id);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="mobile-page settings-page">
      {isMobile && !sidebarOpen && (
        <div className="settings-page-header">
          <button
            type="button"
            className="settings-page-sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={false}
          >
            <Menu size={22} />
          </button>
          <h2 className="settings-page-title">Settings</h2>
        </div>
      )}
      {isMobile && sidebarOpen && (
        <div
          className="settings-page-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside className={`settings-page-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Settings sections">
        {isMobile && (
          <div className="settings-sidebar-header">
            <button
              type="button"
              className="settings-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
            <h2 className="settings-sidebar-title">Settings</h2>
          </div>
        )}
        <nav className="settings-sidebar-nav">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={tab === s.id}
              className={`settings-sidebar-item ${tab === s.id ? 'active' : ''}`}
              onClick={() => handleSectionClick(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="settings-page-content">
        <div className="settings-modal-body settings-page-body">{children}</div>
      </div>
    </div>
  );
}
