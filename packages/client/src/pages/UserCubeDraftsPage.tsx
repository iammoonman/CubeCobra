import React, { useCallback, useContext, useState } from 'react';

import Draft from '@utils/datatypes/Draft';

import { Flexbox } from 'components/base/Layout';
import Link from 'components/base/Link';
import Pagination from 'components/base/Pagination';
import Text from 'components/base/Text';
import DeckPreview from 'components/DeckPreview';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import { CSRFContext } from 'contexts/CSRFContext';
import MainLayout from 'layouts/MainLayout';

interface UserCubeDraftsPageProps {
  decks: Draft[];
  lastKey: any;
}

const PAGE_SIZE = 36;

const UserCubeDraftsPage: React.FC<UserCubeDraftsPageProps> = ({ decks, lastKey }) => {
  const { csrfFetch } = useContext(CSRFContext);
  const [items, setItems] = useState<Draft[]>(decks);
  const [currentLastKey, setCurrentLastKey] = useState<any>(lastKey);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!currentLastKey;

  const fetchMoreData = useCallback(async () => {
    setLoading(true);
    const response = await csrfFetch(`/dashboard/getmoredecks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastKey: currentLastKey }),
    });
    if (response.ok) {
      const json = await response.json();
      if (json.success === 'true') {
        setItems([...items, ...json.items]);
        setPage(page + 1);
        setCurrentLastKey(json.lastKey);
      }
    }
    setLoading(false);
  }, [currentLastKey, items, page, csrfFetch]);

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
      <DynamicFlash />
      <Flexbox direction="col" gap="3" className="my-3">
        <Flexbox direction="col" alignItems="start" gap="2" className="w-full md:hidden">
          <Text lg semibold>
            Drafts of your Cubes ({items.length}
            {hasMore ? '+' : ''})
          </Text>
          {items.length > 0 && <div className="w-full">{pager}</div>}
        </Flexbox>
        <Flexbox direction="row" justify="between" alignItems="center" className="w-full hidden md:flex">
          <Text lg semibold>
            Drafts of your Cubes ({items.length}
            {hasMore ? '+' : ''})
          </Text>
          {items.length > 0 && pager}
        </Flexbox>
        {items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 5xl:grid-cols-6">
            {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((deck) => (
              <DeckPreview key={deck.id} deck={deck} />
            ))}
          </div>
        ) : (
          <Text>
            Nobody has drafted your cubes! Perhaps try reaching out on the{' '}
            <Link href="https://discord.gg/YYF9x65Ane">Discord draft exchange?</Link>
          </Text>
        )}
      </Flexbox>
    </MainLayout>
  );
};

export default RenderToRoot(UserCubeDraftsPage);
