import { useMemo, useState } from 'react';
import { LogOut, ChevronRight, Settings, Users, Code, Building2, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Project, Role } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import logo from '@/assets/triple-tree-logo.png';

interface SidebarProps {
  selectedProject: Project;
  onProjectChange: (project: Project) => void;
  projects: Project[];
  role: Role;
  onLogout: () => void;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
}

const projectColors = ['bg-kpi-orange-text', 'bg-kpi-blue-text', 'bg-kpi-green-text', 'bg-kpi-purple-text', 'bg-kpi-cyan-text'];

export const Sidebar = ({
  selectedProject,
  onProjectChange,
  projects,
  role,
  onLogout,
  isSuperAdmin = false,
  isAdmin = false
}: SidebarProps) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isActive = (path: string) => location.pathname === path;

  // Memoize admin menu items to prevent flickering during role state updates
  const adminMenuItems = useMemo(() => {
    if (!isAdmin) return null;
    
    return (
      <>
        <Link 
          to="/admin" 
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-2 text-sm w-full px-3 py-2 rounded-lg transition-colors",
            isActive('/admin') 
              ? "bg-primary text-primary-foreground font-medium"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings size={16} /> Projectbeheer
        </Link>
        <Link 
          to="/admin/users" 
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-2 text-sm w-full px-3 py-2 rounded-lg transition-colors",
            isActive('/admin/users') 
              ? "bg-primary text-primary-foreground font-medium"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Users size={16} /> Gebruikers
        </Link>
        <Link 
          to="/admin/customers" 
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-2 text-sm w-full px-3 py-2 rounded-lg transition-colors",
            isActive('/admin/customers') 
              ? "bg-primary text-primary-foreground font-medium"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Building2 size={16} /> Klantenbeheer
        </Link>
      </>
    );
  }, [isAdmin, location.pathname]);

  // Memoize developer menu item to prevent flickering
  const devMenuItem = useMemo(() => {
    if (!isSuperAdmin) return null;
    
    return (
      <Link 
        to="/developer" 
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2 text-sm w-full px-3 py-2 rounded-lg transition-colors",
          isActive('/developer') 
            ? "bg-kpi-purple text-kpi-purple-text font-medium"
            : "text-kpi-purple-text hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <Code size={16} /> Developer
      </Link>
    );
  }, [isSuperAdmin, location.pathname]);

  const handleProjectChange = (proj: Project) => {
    onProjectChange(proj);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setMobileOpen(false);
    onLogout();
  };

  const sidebarContent = (
    <>
      <div className="p-4 sm:p-6 border-b border-border py-4 sm:py-[25px] px-0 flex items-center justify-center flex-shrink-0">
        <img src={logo} alt="Triple Tree Logo" className="h-10 sm:h-12 w-auto object-contain" />
      </div>

      <nav className="p-3 sm:p-4 space-y-1 flex-1 overflow-y-auto min-h-0" data-tour="sidebar-projects">
        <div className="text-xs uppercase text-sidebar-foreground/60 font-bold px-3 mb-3 mt-2">
          Campagnes
        </div>
        {projects.map((proj, idx) => (
          <button
            key={proj}
            onClick={() => handleProjectChange(proj)}
            aria-label={`Selecteer campagne ${proj}`}
            aria-current={selectedProject === proj ? 'true' : undefined}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background",
              selectedProject === proj
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-sidebar-foreground hover:bg-sidebar-accent'
            )}
          >
            <div aria-hidden="true" className={`w-2 h-2 rounded-full ${projectColors[idx % projectColors.length]}`}></div>
            <span className="capitalize font-medium text-sm sm:text-base">{proj}</span>
            {selectedProject === proj && <ChevronRight size={16} className="ml-auto" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      <div className="p-3 sm:p-4 border-t border-sidebar-border space-y-1 flex-shrink-0" data-tour="sidebar-admin-links">
        {adminMenuItems}
        {devMenuItem}
        <button 
          onClick={handleLogout} 
          className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground text-sm w-full px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
        >
          <LogOut size={16} /> Uitloggen
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header with Hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black border-b border-border px-4 py-3 flex items-center justify-between">
        <img src={logo} alt="Triple Tree Logo" className="h-8 w-auto object-contain" />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu openen" className="text-white hover:bg-gray-800">
              <Menu size={24} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-black border-r border-border">
            <div className="flex flex-col h-full">
              {sidebarContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-black border-r border-border flex-shrink-0 flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  );
};
