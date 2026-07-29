import { useQuery } from '@tanstack/react-query';
import { healthService } from '../services/healthService';

export function useHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => healthService.check(),
    refetchInterval: 30_000,
  });
}
