export interface Environment {
  production: boolean;
  apiUrl: string;
  gemini?: {
    apiKey: string;
  };
}
