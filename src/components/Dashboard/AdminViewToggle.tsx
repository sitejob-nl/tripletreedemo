import { Eye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface AdminViewToggleProps {
  viewAsClient: boolean;
  onViewAsClientChange: (value: boolean) => void;
}

export function AdminViewToggle({ viewAsClient, onViewAsClientChange }: AdminViewToggleProps) {
  return (
    <div className="px-4 sm:px-8 pt-4" data-tour="admin-view-toggle">
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border w-fit">
        <Eye size={16} className="text-muted-foreground" />
        <Label htmlFor="view-as-client" className="text-sm font-medium cursor-pointer">
          Bekijk als klant
        </Label>
        <Switch
          id="view-as-client"
          checked={viewAsClient}
          onCheckedChange={onViewAsClientChange}
        />
      </div>
    </div>
  );
}
