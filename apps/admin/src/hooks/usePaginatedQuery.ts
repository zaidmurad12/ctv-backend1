import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from './useDebouncedValue';
import type { ListParams, Page } from '../services/types';

export interface UsePaginatedQueryOptions<T, P extends ListParams> {
  readonly queryKey: readonly unknown[];
  readonly fetcher: (params: P) => Promise<Page<T>>;
  readonly initialParams?: Partial<P>;
  readonly enabled?: boolean;
  readonly extraParams?: Partial<P>;
}

/** Shared pagination/search/sort state + TanStack Query wiring for every list page. */
export function usePaginatedQuery<T, P extends ListParams = ListParams>({
  queryKey,
  fetcher,
  initialParams,
  enabled = true,
  extraParams,
}: UsePaginatedQueryOptions<T, P>) {
  const [page, setPage] = useState(initialParams?.page ?? 1);
  const [limit, setLimit] = useState(initialParams?.limit ?? 20);
  const [search, setSearch] = useState(initialParams?.search ?? '');
  const [sort, setSort] = useState(initialParams?.sort);
  const [order, setOrder] = useState<'asc' | 'desc'>(initialParams?.order ?? 'desc');

  const debouncedSearch = useDebouncedValue(search, 300);

  const params = {
    ...extraParams,
    page,
    limit,
    search: debouncedSearch || undefined,
    sort,
    order,
  } as P;

  const query = useQuery({
    queryKey: [...queryKey, params],
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
    enabled,
  });

  function onSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function onSortChange(key: string) {
    if (sort === key) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
    setPage(1);
  }

  function onLimitChange(nextLimit: number) {
    setLimit(nextLimit);
    setPage(1);
  }

  return {
    ...query,
    items: query.data?.items ?? [],
    meta: query.data?.meta,
    page,
    limit,
    search,
    sort,
    order,
    setPage,
    onSearchChange,
    onSortChange,
    onLimitChange,
  };
}
