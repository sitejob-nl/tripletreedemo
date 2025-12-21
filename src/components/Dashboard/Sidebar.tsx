import { LogOut, ChevronRight, Settings, Users, Code } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Project, Role } from '@/types/dashboard';
import logo from '@/assets/triple-tree-logo.png';

interface SidebarProps {
  selectedProject: Project;
  onProjectChange: (project: Project) => void;
  projects: Project[];
  role: Role;
  onLogout: () => void;
  isSuperAdmin?: boolean;
}
export const Sidebar = ({
  selectedProject,
  onProjectChange,
  projects,
  role,
  onLogout,
  isSuperAdmin = false
}: SidebarProps) => {
  const projectColors = ['bg-kpi-orange-text', 'bg-kpi-blue-text', 'bg-kpi-green-text', 'bg-kpi-purple-text', 'bg-kpi-cyan-text'];
  return <aside className="w-full md:w-64 bg-black border-r border-border flex-shrink-0 flex flex-col">
      <div className="p-6 border-b border-border py-[25px] px-0 flex items-center justify-center">
        <img src={logo} alt="Triple Tree Logo" className="h-12 w-auto object-contain" />
      </div>

      <nav className="p-4 space-y-1 flex-1">
        <div className="text-xs uppercase text-gray-400 font-bold px-3 mb-3 mt-2">
          Campagnes
        </div>
        {projects.map((proj, idx) => <button key={proj} onClick={() => onProjectChange(proj)} className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all ${selectedProject === proj ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white hover:bg-gray-800'}`}>
            <div className={`w-2 h-2 rounded-full ${projectColors[idx % projectColors.length]}`}></div>
            <span className="capitalize font-medium">{proj}</span>
            {selectedProject === proj && <ChevronRight size={16} className="ml-auto" />}
          </button>)}
      </nav>

      <div className="mt-auto p-4 border-t border-gray-800 space-y-1">
        {role === 'admin' && (
          <>
            <Link 
              to="/admin" 
              className="flex items-center gap-2 text-gray-400 hover:text-white text-sm w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Settings size={16} /> Projectbeheer
            </Link>
            <Link 
              to="/admin/users" 
              className="flex items-center gap-2 text-gray-400 hover:text-white text-sm w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Users size={16} /> Gebruikers
            </Link>
          </>
        )}
        {isSuperAdmin && (
          <Link 
            to="/developer" 
            className="flex items-center gap-2 text-kpi-purple-text hover:text-white text-sm w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Code size={16} /> Developer
          </Link>
        )}
        <button onClick={onLogout} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
          <LogOut size={16} /> Uitloggen
        </button>
      </div>
    </aside>;
};