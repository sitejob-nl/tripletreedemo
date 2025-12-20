import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DBProject } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface ProjectSelectorProps {
  projects: DBProject[];
  selectedProjectKey: string;
  onProjectChange: (projectKey: string) => void;
  isLoading?: boolean;
}

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

  return (
    <Select value={selectedProjectKey} onValueChange={onProjectChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Selecteer project" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.project_key} value={project.project_key}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
