import { useQuery } from '@tanstack/react-query';
import { providersService } from '../services/providersService';

export function useProviders() {
  return useQuery({
    queryKey: ['providers', 'list'],
    queryFn: () => providersService.list(),
  });
}

export function useProviderHealth() {
  return useQuery({
    queryKey: ['providers', 'health'],
    queryFn: () => providersService.health(),
    refetchInterval: 30_000,
  });
}
