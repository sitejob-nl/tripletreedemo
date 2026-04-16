import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DBProject, ProjectType } from '@/types/database';
import { Loader2, PhoneOutgoing, PhoneIncoming, Headphones } from 'lucide-react';

interface ProjectSelectorProps {
  projects: DBProject[];
  selectedProjectKey: string;
  onProjectChange: (projectKey: string) => void;
  isLoading?: boolean;
}

const typeIcon = (t: ProjectType | undefined) => {
  switch (t) {
    case 'inbound': return <PhoneIncoming size={14} className="text-kpi-blue-text" />;
    case 'inbound_service': return <Headphones size={14} className="text-kpi-cyan-text" />;
    case 'outbound':
    default: return <PhoneOutgoing size={14} className="text-kpi-green-text" />;
  }
};

const typeLabel = (t: ProjectType | undefined) => {
  switch (t) {
    case 'inbound': return 'Retentie';
    case 'inbound_service': return 'Service';
    case 'outbound':
    default: return 'Outbound';
  }
};

export const ProjectSelector = ({
  projects,
  selectedProjectKey,
  onProjectChange,
  isLoading,
}: ProjectSelectorProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Projecten laden...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        Geen actieve projecten gevonden
      </div>
    );
  }

  const selected = projects.find((p) => p.project_key === selectedProjectKey);

  return (
    <Select value={selectedProjectKey} onValueChange={onProjectChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Selecteer project">
          {selected && (
            <span className="flex items-center gap-2 truncate">
              {typeIcon(selected.project_type)}
              <span className="truncate">{selected.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.project_key} value={project.project_key}>
            <span className="flex items-center gap-2">
              {typeIcon(project.project_type)}
              <span>{project.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide ml-1">
                {typeLabel(project.project_type)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
