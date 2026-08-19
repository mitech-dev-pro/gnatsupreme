import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";

export type SmsMessage = {
  to: string;
  message: string;
};

export type SmsResult = {
  providerMessageId: string;
};

export interface SmsProvider {
  send(input: SmsMessage): Promise<SmsResult>;
}

class ConsoleSmsProvider implements SmsProvider {
  async send(input: SmsMessage) {
    console.info(`[DEV SMS] To: ${input.to}\n${input.message}`);
    return { providerMessageId: `console-${randomUUID()}` };
  }
}

export const smsProvider: SmsProvider = (() => {
  if (env.SMS_PROVIDER === "CONSOLE") return new ConsoleSmsProvider();
  throw new Error(`Unsupported SMS provider: ${env.SMS_PROVIDER}`);
})();
