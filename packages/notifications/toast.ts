import { toast as sonner } from "sonner";

export const toast = {
  success: (message: string, description?: string, id?: string) =>
    sonner.success(message, { description, id, duration: 5000 }),
  info: (message: string, description?: string) =>
    sonner.info(message, { description }),
  error: (message: string, description?: string, id?: string) =>
    sonner.error(message, { description, id, duration: Infinity }),
  dismiss: () => sonner.dismiss(),
};
