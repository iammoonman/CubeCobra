import React, { useCallback, useContext, useEffect, useState } from 'react';

import CardPackageData from '@utils/datatypes/CardPackage';
import User from '@utils/datatypes/User';

import { Flexbox } from 'components/base/Layout';
import Pagination from 'components/base/Pagination';
import Select from 'components/base/Select';
import Text from 'components/base/Text';
import CardPackage from 'components/card/CardPackage';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import { CSRFContext } from 'contexts/CSRFContext';
import useQueryParam from 'hooks/useQueryParam';
import MainLayout from 'layouts/MainLayout';
import UserLayout from 'layouts/UserLayout';

const PAGE_SIZE = 36;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'date', label: 'Sorted by Date' },
  { value: 'votes', label: 'Sorted by Popularity' },
];

interface LikedPackagesPageProps {
  owner: User;
  items: CardPackageData[];
  lastKey?: any;
  sort?: string;
  ascending?: boolean;
  followersCount: number;
  followingCount: number;
  following: boolean;
  patronLevel?: number;
  likedCubesCount?: number;
  likedPackagesCount?: number;
}

const LikedPackagesPage: React.FC<LikedPackagesPageProps> = ({
  owner,
  items: initialItems,
  lastKey: initialLastKey,
  sort: initialSort,
  ascending: initialAscending,
  followersCount,
  followingCount,
  following,
  patronLevel,
  likedCubesCount,
  likedPackagesCount,
}) => {
  const { csrfFetch } = useContext(CSRFContext);

  const [sort, setSort] = useQueryParam('s', initialSort || 'date');
  const [ascending, setAscending] = useQueryParam('a', initialAscending ? 'true' : 'false');

  const [items, setItems] = useState<CardPackageData[]>(initialItems);
  const [currentLastKey, setLastKey] = useState<any>(initialLastKey);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!currentLastKey;

  const loadInitial = useCallback(
    async (s: string | null, a: string | null) => {
      setLoading(true);
      setItems([]);
      setPage(0);
      const response = await csrfFetch('/packages/liked/getmore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: owner.id, sort: s, ascending: a, lastKey: null }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success === 'true') {
          setItems(json.packages || []);
          setLastKey(json.lastKey);
        }
      }
      setLoading(false);
    },
    [csrfFetch, owner.id],
  );

  // Re-fetch when sort/order change
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    loadInitial(sort, ascending);
  }, [sort, ascending, loadInitial]);

  const fetchMoreData = useCallback(async () => {
    setLoading(true);
    const response = await csrfFetch('/packages/liked/getmore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: owner.id, sort, ascending, lastKey: currentLastKey }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json.success === 'true') {
        const newItems = [...items, ...(json.packages || [])];
        setItems(newItems);
        setLastKey(json.lastKey);

        const numItemsOnLastPage = items.length % PAGE_SIZE;
        const newItemsOnLastPage = newItems.length % PAGE_SIZE;
        if (numItemsOnLastPage === 0 && newItemsOnLastPage > 0) {
          setPage(page + 1);
        }
      }
    }
    setLoading(false);
  }, [csrfFetch, owner.id, sort, ascending, currentLastKey, items, page]);

  const pager = (
    <Pagination
      count={pageCount}
      active={page}
      hasMore={hasMore}
      onClick={async (newPage) => {
        if (newPage >= pageCount) {
          await fetchMoreData();
        } else {
          setPage(newPage);
        }
      }}
      loading={loading}
    />
  );

  return (
    <MainLayout>
      <UserLayout
        user={owner}
        followersCount={followersCount}
        followingCount={followingCount}
        following={following}
        activeLink="liked-packages"
        patronLevel={patronLevel}
        likedCubesCount={likedCubesCount}
        likedPackagesCount={likedPackagesCount}
      >
        <DynamicFlash />
        <Flexbox direction="col" className="mt-3" gap="2">
          <Flexbox direction="row" justify="between" alignItems="center" gap="2" wrap="wrap" className="w-full">
            <Text lg semibold>
              Liked Packages ({items.length}
              {hasMore ? '+' : ''})
            </Text>
            <Flexbox direction="row" alignItems="center" gap="2">
              <div className="w-52">
                <Select dense options={SORT_OPTIONS} value={sort || 'date'} setValue={(value) => setSort(value)} />
              </div>
              <div className="w-36">
                <Select
                  dense
                  options={[
                    { value: 'true', label: 'Ascending' },
                    { value: 'false', label: 'Descending' },
                  ]}
                  value={ascending || 'false'}
                  setValue={(value) => setAscending(value)}
                />
              </div>
            </Flexbox>
          </Flexbox>

          {items.length > 0 && (
            <Flexbox direction="row" justify="end" alignItems="center" className="w-full">
              {pager}
            </Flexbox>
          )}

          {items.length > 0 ? (
            <Flexbox direction="col" gap="2">
              {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((pack) => (
                <CardPackage key={pack.id} cardPackage={pack} />
              ))}
              <Flexbox direction="row" justify="end" alignItems="center" className="w-full mt-3">
                {pager}
              </Flexbox>
            </Flexbox>
          ) : (
            <Text className="text-text-secondary">{loading ? 'Loading…' : 'No liked packages yet.'}</Text>
          )}
        </Flexbox>
      </UserLayout>
    </MainLayout>
  );
};

export default RenderToRoot(LikedPackagesPage);
