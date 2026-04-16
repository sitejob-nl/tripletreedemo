import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStatus {
  project_id: string;
  name: string;
  basicall_project_id: number;
  project_type: string | null;
  has_token: boolean;
  has_mapping: boolean;
  has_records: boolean;
  has_batch: boolean;
  has_customer: boolean;
  has_recent_sync: boolean;
  is_incomplete: boolean;
}

// Haalt voor elk actief project de 6 onboarding-checkpoints op. Admin-widget gebruikt
// dit om projecten zonder token/mapping/records visueel af te vinken.
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["project_onboarding_status"],
    queryFn: async (): Promise<OnboardingStatus[]> => {
      const { data, error } = await supabase
        .from("project_onboarding_status" as any)
        .select("*")
        .order("basicall_project_id");
      if (error) throw error;
      return (data || []) as unknown as OnboardingStatus[];
    },
  });
}
