import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

export type AppSettings = {
  id: number;
  budgetRequiresApproval: boolean;
  budgetThresholdPercent: number;
  updatedAt: string;
  updatedByUserId: number | null;
};

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const res = await api.get("/settings");
      return res.data as AppSettings;
    },
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (
      payload: Partial<Pick<AppSettings, "budgetRequiresApproval" | "budgetThresholdPercent">>,
    ) => {
      const res = await api.patch("/settings", payload);
      return res.data as AppSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Settings updated");
    },
    onError: (err: any) => {
      toast.error("Failed to update settings", err?.response?.data?.error?.message);
    },
  });
}
