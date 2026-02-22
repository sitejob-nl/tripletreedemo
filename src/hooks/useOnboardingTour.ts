import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tripletree_onboarding_v2';

export interface TourStep {
  id: string;
  target: string | null; // null = overlay step (centered)
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  requiredRole?: 'admin';
  optional?: boolean; // skip if element not found
}

const ALL_STEPS: TourStep[] = [
  // Step 1: Welcome
  {
    id: 'welcome',
    target: null,
    title: 'Welkom bij Triple Tree! 👋',
    description: 'We laten je in een paar stappen zien hoe het dashboard werkt. Je kunt de rondleiding altijd overslaan of later opnieuw starten.',
    position: 'center',
  },
  // Step 2: Sidebar projects
  {
    id: 'sidebar-projects',
    target: 'sidebar-projects',
    title: 'Campagnes kiezen',
    description: 'Hier vind je al je campagnes. Klik op een campagne om de bijbehorende data te bekijken.',
    position: 'right',
  },
  // Step 3: Admin links (admin only)
  {
    id: 'sidebar-admin-links',
    target: 'sidebar-admin-links',
    title: 'Beheertools',
    description: 'Vanuit de sidebar kun je naar Projectbeheer, Gebruikers en Klantenbeheer navigeren.',
    position: 'right',
    requiredRole: 'admin',
  },
  // Step 4: Admin view toggle (admin only)
  {
    id: 'admin-view-toggle',
    target: 'admin-view-toggle',
    title: 'Perspectief wisselen',
    description: 'Schakel deze toggle in om het dashboard te zien zoals je klanten het zien — handig voor controle.',
    position: 'bottom',
    requiredRole: 'admin',
  },
  // Step 5: Date filter
  {
    id: 'date-filter',
    target: 'date-filter',
    title: 'Periode selecteren',
    description: 'Filter op een specifieke week of kies een datumbereik om precies de juiste periode te bekijken.',
    position: 'bottom',
  },
  // Step 6: View buttons
  {
    id: 'view-buttons',
    target: 'view-buttons',
    title: 'Drie weergaven',
    description: 'Wissel tussen Rapport (tabeloverzicht), Visueel (grafieken) en Analyse (geavanceerde statistieken).',
    position: 'bottom',
    optional: true,
  },
  // Step 7: Mapping tool (admin only)
  {
    id: 'mapping-tool',
    target: 'mapping-tool',
    title: 'Project configuratie',
    description: 'Hier stel je de kolommen, tarieven en resultaatmapping in voor elk project. Dit bepaalt hoe de KPI\'s worden berekend.',
    position: 'bottom',
    requiredRole: 'admin',
    optional: true,
  },
  // Step 8: Hours correction (admin only)
  {
    id: 'hours-correction',
    target: 'hours-correction',
    title: 'Uren aanpassen',
    description: 'Wanneer er een datumfilter actief is, kun je hier de geregistreerde uren per dag bekijken en corrigeren.',
    position: 'bottom',
    requiredRole: 'admin',
    optional: true,
  },
  // Step 9: Sync status (admin only)
  {
    id: 'sync-status',
    target: 'sync-status',
    title: 'Synchronisatie',
    description: 'Hier zie je wanneer de data voor het laatst is gesynchroniseerd met BasiCall.',
    position: 'bottom',
    requiredRole: 'admin',
  },
  // Step 10: KPI cards
  {
    id: 'kpi-cards',
    target: 'kpi-cards',
    title: 'Prestatie-indicatoren',
    description: 'De KPI-kaarten tonen de belangrijkste cijfers: conversies, jaarwaarde, kosten per donateur en gewerkte uren.',
    position: 'top',
    optional: true,
  },
  // Step 11: Report section
  {
    id: 'report-section',
    target: 'report-section',
    title: 'Resultatenmatrix',
    description: 'De rapporttabel toont alle belresultaten per dag. Je kunt het rapport exporteren naar Excel.',
    position: 'top',
    optional: true,
  },
  // Step 12: Help button
  {
    id: 'help-button',
    target: 'help-button',
    title: 'Formules en uitleg',
    description: 'Wil je weten hoe een getal wordt berekend? Klik hier voor uitleg over alle formules en berekeningen.',
    position: 'bottom',
  },
  // Step 13: Admin panel hint (admin only)
  {
    id: 'admin-panel-hint',
    target: null,
    title: 'Admin panel',
    description: 'In het admin-panel kun je projecten toevoegen, klanten beheren, gebruikersrollen instellen en sync-jobs starten. Je vindt het via de links in de sidebar.',
    position: 'center',
    requiredRole: 'admin',
  },
  // Step 14: Finish
  {
    id: 'finish',
    target: null,
    title: 'Klaar! 🎉',
    description: 'Je bent helemaal klaar! Je kunt de rondleiding altijd opnieuw starten via de "Rondleiding" knop in de header.',
    position: 'center',
  },
];

export function getStepsForRole(isAdmin: boolean): TourStep[] {
  return ALL_STEPS.filter(step => {
    if (step.requiredRole === 'admin' && !isAdmin) return false;
    return true;
  });
}

export function useOnboardingTour(isAdmin: boolean) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = getStepsForRole(isAdmin);
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] || null;

  // Auto-start on first visit
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay to let the dashboard render first
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentStepIndex(0);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex >= totalSteps - 1) {
      skipTour();
      return;
    }

    // Find next visible step (skip optional steps where element is not found)
    let next = currentStepIndex + 1;
    while (next < totalSteps) {
      const step = steps[next];
      if (!step.target || !step.optional) break;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) break;
      next++;
    }
    if (next >= totalSteps) {
      // Jump to last step (finish overlay)
      setCurrentStepIndex(totalSteps - 1);
    } else {
      setCurrentStepIndex(next);
    }
  }, [currentStepIndex, totalSteps, steps, skipTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex <= 0) return;

    let prev = currentStepIndex - 1;
    while (prev > 0) {
      const step = steps[prev];
      if (!step.target || !step.optional) break;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) break;
      prev--;
    }
    setCurrentStepIndex(prev);
  }, [currentStepIndex, steps]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    startTour();
  }, [startTour]);

  return {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    resetTour,
  };
}
