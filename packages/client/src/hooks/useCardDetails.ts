import { useEffect, useMemo, useState } from 'react';

import { CardDetails } from '@utils/datatypes/Card';

import { getCardDetail, getCardDetails } from 'utils/cardDetailsCache';

export interface UseCardDetailsResult {
  details: Record<string, CardDetails | null>;
  loading: boolean;
}

export const useCardDetails = (ids: string[]): UseCardDetailsResult => {
  // Stable, order-independent key so re-renders with the same set don't refetch.
  const key = useMemo(() => [...new Set(ids)].sort().join(','), [ids]);
  const [details, setDetails] = useState<Record<string, CardDetails | null>>({});
  const [loading, setLoading] = useState(ids.length > 0);

  useEffect(() => {
    if (!key) {
      setDetails({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCardDetails(key.split(',')).then((result) => {
      if (cancelled) return;
      setDetails(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { details, loading };
};

export interface UseCardDetailResult {
  details: CardDetails | null;
  loading: boolean;
}

export const useCardDetail = (id: string | null | undefined): UseCardDetailResult => {
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) {
      setDetails(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCardDetail(id).then((value) => {
      if (cancelled) return;
      setDetails(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { details, loading };
};
