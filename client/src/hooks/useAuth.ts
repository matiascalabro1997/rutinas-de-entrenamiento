import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.auth.me,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  async function logout() {
    await api.auth.logout();
    queryClient.clear();
  }

  return { user: user ?? null, isLoading, logout };
}
