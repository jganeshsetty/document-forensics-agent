"use client";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  searchQuery = "",
  setSearchQuery,
}: NavbarProps) {
  const tabs = [
    { id: "uploads", label: "Uploads" },
    { id: "analysis-report", label: "Analysis Report" },
    { id: "document-map", label: "Document Map" },
    { id: "assistant", label: "Assistant" },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-surface-container-lowest border-b border-outline-variant/30 backdrop-blur-md bg-opacity-95">
      <div className="h-16 w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          {/* Brand */}
          <div
            onClick={() => setActiveTab("uploads")}
            className="flex items-center gap-2.5 cursor-pointer select-none flex-shrink-0"
          >
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary flex-shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
            </div>
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-semibold hidden xs:inline sm:inline">
              DocVerify
            </span>
          </div>

          {/* Navigation Links (Fully responsive with horizontal scroll if needed) */}
          <nav className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low overflow-x-auto scrollbar-none flex-shrink min-w-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg transition-all font-label-md text-label-md whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? "bg-surface-container-high text-on-surface font-semibold shadow-xs"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Search & Analyst Profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="relative hidden md:block w-48 lg:w-60">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              placeholder="Search documents and extracted text..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-outline border border-outline-variant/30 focus:outline-none focus:border-primary transition-all"
            />
          </div>

          <button
            type="button"
            className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors flex-shrink-0"
            title="Notifications"
            aria-label="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>

          <div className="h-5 w-px bg-outline-variant/40 mx-0.5 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="font-label-md text-label-md text-on-surface leading-tight font-medium">
                Forensic Auditor
              </p>
              <p className="text-xs font-medium text-on-surface-variant">
                Verified Identity
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-xs flex-shrink-0 text-on-primary">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
