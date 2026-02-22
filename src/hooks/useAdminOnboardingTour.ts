import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tripletree_admin_onboarding_v1';

export interface AdminTourStep {
  id: string;
  target: string | null;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  optional?: boolean;
  /** If set, the tour will switch to this tab before highlighting */
  switchToTab?: string;
}

const ADMIN_STEPS: AdminTourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welkom bij het Admin Panel! 🛠️',
    description: 'Hier beheer je alles: projecten, klanten, gebruikers en data-synchronisatie. We lopen alle onderdelen even langs.',
    position: 'center',
  },
  {
    id: 'admin-tabs',
    target: 'admin-tabs',
    title: 'Navigatie-tabs',
    description: 'Gebruik deze tabs om te wisselen tussen de verschillende beheeronderdelen: Dashboard, Projecten, Klanten, Gebruikers en Synchronisatie.',
    position: 'bottom',
  },
  {
    id: 'admin-stats',
    target: 'admin-stats',
    title: 'Overzicht statistieken',
    description: 'Hier zie je in één oogopslag hoeveel projecten, klanten, gebruikers en voltooide sync-jobs er zijn. Klik op een kaart om direct naar dat onderdeel te gaan.',
    position: 'bottom',
    optional: true,
  },
  {
    id: 'admin-quick-actions',
    target: 'admin-quick-actions',
    title: 'Snelle acties',
    description: 'Maak snel een nieuw project aan, voeg een klant toe, of start een synchronisatie — zonder eerst naar het juiste tabblad te hoeven navigeren.',
    position: 'bottom',
    optional: true,
  },
  {
    id: 'admin-recent-jobs',
    target: 'admin-recent-jobs',
    title: 'Recente sync jobs',
    description: 'Bekijk de status van de meest recente synchronisaties. Groen = voltooid, rood = mislukt, oranje = bezig.',
    position: 'top',
    optional: true,
  },
  {
    id: 'admin-projects-tab',
    target: 'admin-projects-tab',
    title: 'Projecten beheren',
    description: 'Klik op "Projecten" om alle campagnes te zien. Je kunt projecten toevoegen, bewerken, activeren/deactiveren en verwijderen.',
    position: 'bottom',
    switchToTab: 'projecten',
  },
  {
    id: 'admin-projects-table',
    target: 'admin-projects-table',
    title: 'Projectenlijst',
    description: 'Hier staan al je projecten met naam, BasiCall ID, uurtarief en status. Gebruik de zoekbalk om snel te filteren. Klik op het tandwiel-icoon om een project te bewerken.',
    position: 'top',
    optional: true,
    switchToTab: 'projecten',
  },
  {
    id: 'admin-customers-tab',
    target: 'admin-customers-tab',
    title: 'Klantenbeheer',
    description: 'In het "Klanten" tabblad koppel je gebruikersaccounts aan specifieke projecten, zodat klanten alleen hun eigen campagnedata zien.',
    position: 'bottom',
    switchToTab: 'klanten',
  },
  {
    id: 'admin-customers-table',
    target: 'admin-customers-table',
    title: 'Klanten en projectkoppelingen',
    description: 'Bekijk welke klanten toegang hebben tot welke projecten. Voeg nieuwe klanten toe via e-mail of koppel bestaande klanten aan extra projecten.',
    position: 'top',
    optional: true,
    switchToTab: 'klanten',
  },
  {
    id: 'admin-users-tab',
    target: 'admin-users-tab',
    title: 'Gebruikersbeheer',
    description: 'In "Gebruikers" beheer je rollen: wie is admin, wie is gewone gebruiker? Admins hebben toegang tot het beheer, gebruikers zien alleen het klantdashboard.',
    position: 'bottom',
    switchToTab: 'gebruikers',
  },
  {
    id: 'admin-users-table',
    target: 'admin-users-table',
    title: 'Gebruikersoverzicht',
    description: 'Hier zie je alle gebruikers met hun huidige rol. Je kunt rollen wijzigen of nieuwe gebruikers met een specifieke rol toevoegen.',
    position: 'top',
    optional: true,
    switchToTab: 'gebruikers',
  },
  {
    id: 'admin-sync-tab',
    target: 'admin-sync-tab',
    title: 'Synchronisatie',
    description: 'In het "Synchronisatie" tabblad kun je handmatig data ophalen uit BasiCall. Handig voor het opnieuw synchroniseren van een specifieke periode.',
    position: 'bottom',
    switchToTab: 'sync',
  },
  {
    id: 'admin-sync-manager',
    target: 'admin-sync-manager',
    title: 'Sync jobs starten',
    description: 'Kies een project en een datumperiode, en start een sync-job. Je kunt de voortgang en status hier live volgen.',
    position: 'top',
    optional: true,
    switchToTab: 'sync',
  },
  {
    id: 'admin-back-button',
    target: 'admin-back-button',
    title: 'Terug naar dashboard',
    description: 'Klik hier om terug te gaan naar het hoofddashboard met de campagnedata en rapportages.',
    position: 'right',
  },
  {
    id: 'finish',
    target: null,
    title: 'Klaar! 🎉',
    description: 'Je kent nu alle onderdelen van het admin panel. Je kunt de rondleiding altijd opnieuw starten via de knop rechtsboven.',
    position: 'center',
  },
];

export function useAdminOnboardingTour(onSwitchTab?: (tab: string) => void) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = ADMIN_STEPS;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] || null;

  // Auto-start on first visit
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      const timer = setTimeout(() => setIsActive(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Switch tab when step requires it
  useEffect(() => {
    if (isActive && currentStep?.switchToTab && onSwitchTab) {
      onSwitchTab(currentStep.switchToTab);
    }
  }, [isActive, currentStep, onSwitchTab]);

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

    let next = currentStepIndex + 1;
    while (next < totalSteps) {
      const step = steps[next];
      if (!step.target || !step.optional) break;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) break;
      next++;
    }
    if (next >= totalSteps) {
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

  return {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    startTour,
    nextStep,
    prevStep,
    skipTour,
  };
}
