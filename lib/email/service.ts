export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
