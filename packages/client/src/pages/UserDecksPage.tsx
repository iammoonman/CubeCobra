import React, { useCallback, useContext, useState } from 'react';

import Draft from '@utils/datatypes/Draft';
import User from '@utils/datatypes/User';

import { Flexbox } from 'components/base/Layout';
import Pagination from 'components/base/Pagination';
import Text from 'components/base/Text';
import DeckPreview from 'components/DeckPreview';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import { CSRFContext } from 'contexts/CSRFContext';
import MainLayout from 'layouts/MainLayout';
import UserLayout from 'layouts/UserLayout';

interface UserDecksPageProps {
  owner: User;
  followersCount: number;
  followingCount: number;
  following: boolean;
  decks: Draft[];
  lastKey?: any;
  patronLevel?: number;
  likedCubesCount?: number;
  likedPackagesCount?: number;
}

const PAGE_SIZE = 20;

const UserDecksPage: React.FC<UserDecksPageProps> = ({
  followersCount,
  followingCount,
  following,
  decks,
  owner,
  lastKey,
  patronLevel,
  likedCubesCount,
  likedPackagesCount,
}) => {
  const { csrfFetch } = useContext(CSRFContext);
  const [items, setItems] = useState<Draft[]>(decks);
  const [currentLastKey, setLastKey] = useState(lastKey);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = React.useState(0);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!currentLastKey;

  const fetchMoreData = useCallback(async () => {
    setLoading(true);

    const response = await csrfFetch(`/user/getmoredecks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lastKey: currentLastKey,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json.success === 'true') {
        setItems([...items, ...json.decks]);
        setPage(page + 1);
        setLastKey(json.lastKey);
      }

      setLoading(false);
    }
  }, [csrfFetch, currentLastKey, items, page]);

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
        activeLink="decks"
        patronLevel={patronLevel}
        likedCubesCount={likedCubesCount}
        likedPackagesCount={likedPackagesCount}
      >
        <DynamicFlash />
        <Flexbox direction="col" gap="2" className="mt-3 w-full">
          <Flexbox direction="row" justify="between" alignItems="center" className="w-full">
            <Text lg semibold>
              Drafts ({items.length}
              {hasMore ? '+' : ''})
            </Text>
            {items.length > 0 && pager}
          </Flexbox>

          {items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 5xl:grid-cols-6">
                {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((deck) => (
                  <DeckPreview key={deck.id} deck={deck} />
                ))}
              </div>
              <Flexbox direction="row" justify="end" alignItems="center" className="w-full mt-3">
                {pager}
              </Flexbox>
            </>
          ) : (
            <Text className="text-text-secondary">This user has not drafted any decks yet.</Text>
          )}
        </Flexbox>
      </UserLayout>
    </MainLayout>
  );
};

export default RenderToRoot(UserDecksPage);
