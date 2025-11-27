import { LogOut, ChevronRight } from 'lucide-react';
import { Project, Role } from '@/types/dashboard';

interface SidebarProps {
  selectedProject: Project;
  onProjectChange: (project: Project) => void;
  projects: Project[];
  role: Role;
  onLogout: () => void;
}

export const Sidebar = ({ selectedProject, onProjectChange, projects, role, onLogout }: SidebarProps) => {
  return (
    <aside className="w-full md:w-64 bg-sidebar text-sidebar-foreground flex-shrink-0 flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-xl font-bold tracking-tight">
          Rapportage<span className="text-sidebar-primary">2025</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Triple Tree Portal</p>
      </div>

      <nav className="p-4 space-y-2 flex-1">
        <div className="text-xs uppercase text-muted-foreground font-bold px-3 mb-2 mt-4">
          Campagnes
        </div>
        {projects.map((proj) => (
          <button
            key={proj}
            onClick={() => onProjectChange(proj)}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
              selectedProject === proj
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <span className="capitalize">{proj}</span>
            {selectedProject === proj && <ChevronRight size={14} />}
          </button>
        ))}
      </nav>

      <div className="mt-auto p-4 border-t border-sidebar-border">
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-muted-foreground hover:text-sidebar-foreground text-sm w-full"
        >
          <LogOut size={16} /> Uitloggen ({role})
        </button>
      </div>
    </aside>
  );
};
