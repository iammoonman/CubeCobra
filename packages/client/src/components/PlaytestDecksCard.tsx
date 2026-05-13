import React, { useCallback, useContext, useState } from 'react';

import Draft from '@utils/datatypes/Draft';

import { Card, CardBody, CardFooter, CardHeader } from 'components/base/Card';
import Text from 'components/base/Text';
import DeckPreview from 'components/DeckPreview';
import { CSRFContext } from 'contexts/CSRFContext';

import { Flexbox } from './base/Layout';
import Pagination from './base/Pagination';

interface PlaytestDecksCardProps {
  decks: Draft[];
  decksLastKey: any;
  cubeId: string;
}

const PAGE_SIZE = 25;

const PlaytestDecksCard: React.FC<PlaytestDecksCardProps> = ({ decks, decksLastKey, cubeId }) => {
  const { csrfFetch } = useContext(CSRFContext);
  const [page, setPage] = React.useState(0);
  const [items, setItems] = React.useState<Draft[]>(decks);
  const [lastKey, setLastKey] = useState(decksLastKey);
  const [loading, setLoading] = useState(false);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!lastKey;

  const fetchMore = useCallback(async () => {
    setLoading(true);
    const response = await csrfFetch(`/cube/getmoredecks/${cubeId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cubeId,
        lastKey,
      }),
    });

    if (response.ok) {
      const json = await response.json();

      setLastKey(json.lastKey);
      setItems([...items, ...json.decks]);
      setPage(page + 1);
      setLoading(false);
    }
  }, [csrfFetch, cubeId, items, lastKey, page]);

  const pager = (
    <Pagination
      count={pageCount}
      active={page}
      hasMore={hasMore}
      onClick={async (newPage) => {
        if (newPage >= pageCount) {
          await fetchMore();
        } else {
          setPage(newPage);
        }
      }}
      loading={loading}
    />
  );

  const hasItems = items.length > 0;

  return (
    <Card>
      <CardHeader>
        <Flexbox direction="row" justify="between" alignItems="center" className="w-full">
          <Text lg semibold>
            Drafts ({items.length}
            {hasMore ? '+' : ''})
          </Text>
          {hasItems && pager}
        </Flexbox>
      </CardHeader>
      {hasItems ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((deck) => (
              <DeckPreview key={deck.id} deck={deck} />
            ))}
          </div>
          <CardFooter>
            <Flexbox direction="row" justify="end" alignItems="center" className="w-full">
              {pager}
            </Flexbox>
          </CardFooter>
        </>
      ) : (
        <CardBody>
          <Text className="text-text-secondary">No drafts yet.</Text>
        </CardBody>
      )}
    </Card>
  );
};

export default PlaytestDecksCard;
