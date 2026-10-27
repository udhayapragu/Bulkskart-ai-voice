import type { LanguageCode } from '../domain/languages.js';

export interface SimulationScenario {
  id: string;
  description: string;
  language: LanguageCode;
  supplierTurns: string[];
}

// Scripted supplier behaviour for the mock calling simulator. Each scenario exercises
// one path through the conversation engine.
export const SCENARIOS: SimulationScenario[] = [
  {
    id: 'interested-en',
    description: 'Interested supplier, asks about registration, accepts the website link',
    language: 'en',
    supplierTurns: ['Yes, go ahead.', 'We manufacture cotton fabric and garments.', 'Can you tell me about registration?', 'No, that is all.', 'Yes, please send the link.'],
  },
  {
    id: 'callback-hi',
    description: 'Busy now, asks for a callback in the evening (Hindi)',
    language: 'hi',
    supplierTurns: ['अभी व्यस्त हूँ, कल शाम को कॉल करें।', 'शाम 6 बजे के बाद'],
  },
  {
    id: 'stop-ta',
    description: 'Asks not to be called again (Tamil), must trigger DNC',
    language: 'ta',
    supplierTurns: ['அழைக்க வேண்டாம்'],
  },
  {
    id: 'human-te',
    description: 'Asks to speak to a person (Telugu), must hand off',
    language: 'te',
    supplierTurns: ['నాకు మనిషితో మాట్లాడాలి'],
  },
  {
    id: 'not-interested-ml',
    description: 'Not interested (Malayalam)',
    language: 'ml',
    supplierTurns: ['താൽപ്പര്യമില്ല'],
  },
];

export function scenarioById(id: string): SimulationScenario {
  const found = SCENARIOS.find((scenario) => scenario.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}
