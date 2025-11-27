import { RawCallRecord, ProjectMapping, Project } from '@/types/dashboard';

export const MOCK_BASICALL_DATA: Record<Project, RawCallRecord[]> = {
  hersenstichting: [
    // WEEK 2 (Januari)
    { id: 101, bc_result_naam: "Sale", bc_gesprekstijd: 450, bc_beldatum: "2025-01-07", Nbedrag: "10,00", Ntermijn: "maand", Frequentie: "", bedrag: "" },
    { id: 102, bc_result_naam: "Sale", bc_gesprekstijd: 320, bc_beldatum: "2025-01-08", Nbedrag: "5,00", Ntermijn: "maand", Frequentie: "", bedrag: "" },
    { id: 103, bc_result_naam: "Voicemail", bc_gesprekstijd: 45, bc_beldatum: "2025-01-09", Nbedrag: "", Ntermijn: "", Frequentie: "", bedrag: "" },
    
    // WEEK 3 (Januari)
    { id: 104, bc_result_naam: "Sale", bc_gesprekstijd: 600, bc_beldatum: "2025-01-14", Nbedrag: "50,00", Ntermijn: "jaar", Frequentie: "", bedrag: "" },
    { id: 105, bc_result_naam: "Weigering", bc_gesprekstijd: 120, bc_beldatum: "2025-01-15", Nbedrag: "", Ntermijn: "", Frequentie: "", bedrag: "" },
    
    // WEEK 6 (Februari)
    { id: 106, bc_result_naam: "Sale", bc_gesprekstijd: 400, bc_beldatum: "2025-02-04", Nbedrag: "15,00", Ntermijn: "eenmalig", Frequentie: "", bedrag: "" },
    { id: 107, bc_result_naam: "Sale", bc_gesprekstijd: 550, bc_beldatum: "2025-02-05", Nbedrag: "7,50", Ntermijn: "maand", Frequentie: "", bedrag: "" },
  ],
  anbo: [
    { id: 201, bc_result_naam: "Sale", bc_gesprekstijd: 500, bc_beldatum: "2025-01-10", Nbedrag: "", Ntermijn: "", Frequentie: "Kwartaal", bedrag: "15,00" },
    { id: 202, bc_result_naam: "Weigering", bc_gesprekstijd: 120, bc_beldatum: "2025-01-10", Nbedrag: "", Ntermijn: "", Frequentie: "", bedrag: "" },
    { id: 203, bc_result_naam: "Sale", bc_gesprekstijd: 400, bc_beldatum: "2025-02-06", Nbedrag: "", Ntermijn: "", Frequentie: "Jaar", bedrag: "60,00" },
  ],
  cliniclowns: [
    { id: 301, bc_result_naam: "Donateur", bc_gesprekstijd: 350, bc_beldatum: "2025-01-11", Nbedrag: "", Ntermijn: "", Frequentie: "Mnd", DonatieBedrag: "7,50" },
    { id: 302, bc_result_naam: "Geen interesse", bc_gesprekstijd: 60, bc_beldatum: "2025-02-07", Nbedrag: "", Ntermijn: "", Frequentie: "", DonatieBedrag: "" },
  ]
};

export const INITIAL_MAPPINGS: Record<Project, ProjectMapping> = {
  hersenstichting: {
    amount_col: "Nbedrag",
    freq_col: "Ntermijn",
    hourly_rate: 35.00,
    freq_map: { "maand": 12, "jaar": 1, "kwartaal": 4, "eenmalig": 1 }
  },
  anbo: {
    amount_col: "", 
    freq_col: "",
    hourly_rate: 32.50,
    freq_map: { "maand": 12, "jaar": 1, "kwartaal": 4, "mnd": 12 }
  },
  cliniclowns: {
    amount_col: "DonatieBedrag",
    freq_col: "Frequentie",
    hourly_rate: 30.00,
    freq_map: { "mnd": 12, "jaar": 1, "eenmalig": 1 }
  }
};
