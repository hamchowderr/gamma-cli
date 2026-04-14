export const APP_NAME = 'gamma-cli';

export interface GammaConfig {
  api_key: string;
  defaults: DefaultsConfig;
}

export interface DefaultsConfig {
  format: 'presentation' | 'document' | 'social' | 'webpage';
  text_mode: 'generate' | 'condense' | 'preserve';
  num_cards: number;
  limit: number;
}

export function defaultConfig(): GammaConfig {
  return {
    api_key: '',
    defaults: {
      format: 'presentation',
      text_mode: 'generate',
      num_cards: 10,
      limit: 25,
    },
  };
}
