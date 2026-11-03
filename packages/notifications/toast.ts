import { toast as sonner } from "sonner";

export const toast = {
  success: (message: string, description?: string) =>
    sonner.success(message, { description }),
  info: (message: string, description?: string) =>
    sonner.info(message, { description }),
  error: (message: string, description?: string) =>
    sonner.error(message, { description, duration: Infinity }),
};
