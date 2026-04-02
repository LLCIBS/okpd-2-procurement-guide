export interface OKPDCode {
  code: string;
  name: string;
  description: string;
  category?: string;
  features: {
    nationalTreatment?: {
      bans?: string[];
      restrictions?: string[];
      preferences?: string[];
    };
    standardContracts?: string[];
    smpSonoPreferences?: boolean;
    typicalMistakes?: string[];
    legalBasis?: string[];
    ktru?: string[];
  };
}

export interface Tender {
  id: string;
  title: string;
  price: string;
  restrictions: string;
  link: string;
  platform: string;
  date: string;
  /** Код(ы) ОКПД 2 по объекту закупки из извещения, если есть */
  okpd2?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
