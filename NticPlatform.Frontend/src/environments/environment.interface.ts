export interface Environment {
  production: boolean;
  apiUrl: string;
  gemini?: {
    apiKey: string;
  };
  brevo?: {
    apiKey: string;
    senderEmail?: string;
    senderName?: string;
  };
  smsmode?: {
    apiKey: string;
  };
}

