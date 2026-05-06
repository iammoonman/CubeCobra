import React, { useContext, useEffect, useState } from 'react';

import { detailsToCard } from '@utils/cardutil';
import CardType, { CardDetails } from '@utils/datatypes/Card';

import { Card, CardBody } from '../components/base/Card';
import { Flexbox } from '../components/base/Layout';
import Paginate from '../components/base/Pagination';
import ResponsiveDiv from '../components/base/ResponsiveDiv';
import Spinner from '../components/base/Spinner';
import Text from '../components/base/Text';
import CardGrid from '../components/card/CardGrid';
import FilterCollapse from '../components/FilterCollapse';
import AddToCubeModal from '../components/modals/AddToCubeModal';
import { CSRFContext } from '../contexts/CSRFContext';
import CubeContext from '../contexts/CubeContext';
import FilterContext from '../contexts/FilterContext';

const PAGE_SIZE = 96;

interface SmartSearchAdd {
  details: CardDetails;
  cardID: string;
}

const Suggestions: React.FC = () => {
  const { csrfFetch } = useContext(CSRFContext);
  const { filterInput } = useContext(FilterContext);
  const { cube } = useContext(CubeContext);

  const [adds, setAdds] = useState<SmartSearchAdd[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modalCard, setModalCard] = useState<CardType | null>(null);

  // When the filter changes, jump back to page 0. We track this in a separate
  // effect so it doesn't fight with the fetch effect over the page cursor.
  useEffect(() => {
    setPage(0);
  }, [filterInput, cube.id]);

  // Single fetch effect — runs whenever any input that affects the result
  // changes. No client-side cache; the recommender is fast and this keeps
  // the loading state correct (the previous cache had a stale-closure bug
  // that left the spinner up indefinitely on a re-search).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const res = await csrfFetch(`/cube/api/adds`, {
        method: 'POST',
        body: JSON.stringify({
          cubeID: cube.id,
          skip: page * PAGE_SIZE,
          limit: PAGE_SIZE,
          filterText: filterInput,
          printingPreference: cube.defaultPrinting,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (cancelled) return;
      const json = await res.json();
      if (cancelled) return;
      setAdds(json.adds || []);
      setHasMore(!!json.hasMoreAdds);
      setLoading(false);
    };
    run().catch(() => {
      if (!cancelled) {
        setAdds([]);
        setHasMore(false);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [csrfFetch, cube.id, cube.defaultPrinting, filterInput, page]);

  const pageCards: CardType[] = adds.map((item) => detailsToCard(item.details));

  // The recommender returns a fully-ranked list, so the page count is the
  // current page plus one if there are more results to fetch.
  const pageCount = hasMore ? page + 2 : page + 1;

  return (
    <div className="p-2">
      <Flexbox direction="col" gap="2">
        <Text xl semibold>
          Smart Search
        </Text>
        <Text>
          Smart Search is card search with a context-aware sort. It runs your filter against the full card pool and then
          ranks the results by how well each card fits this specific cube — surfacing relevant additions that a plain
          alphabetical search would bury. Leave the filter blank to see the recommender's top picks for your cube.
        </Text>
        <FilterCollapse isOpen buttonLabel="Search" />
      </Flexbox>

      {loading && pageCards.length === 0 ? (
        <div className="centered m-4">
          <Spinner xl />
        </div>
      ) : pageCards.length > 0 ? (
        <Flexbox direction="col" gap="2" className="mt-2">
          <Flexbox direction="row" justify="between" wrap="wrap" alignItems="center">
            <Text lg semibold className="whitespace-nowrap">
              <ResponsiveDiv baseVisible sm>
                {`Page ${page + 1}`}
              </ResponsiveDiv>
              <ResponsiveDiv md>
                {filterInput
                  ? `Smart-sorted results for the query: ${filterInput}`
                  : 'Top recommended additions for this cube'}
              </ResponsiveDiv>
            </Text>
            <Paginate count={pageCount} active={page} onClick={setPage} hasMore={hasMore} loading={loading} />
          </Flexbox>
          {loading ? (
            <div className="centered m-4">
              <Spinner xl />
            </div>
          ) : (
            <CardGrid
              cards={pageCards}
              xs={2}
              sm={3}
              md={4}
              lg={5}
              xl={6}
              xxl={8}
              cardProps={{ autocard: true, className: 'clickable' }}
              onClick={(card) => setModalCard(card)}
            />
          )}
          <Flexbox direction="row" justify="end">
            <Paginate count={pageCount} active={page} onClick={setPage} hasMore={hasMore} loading={loading} />
          </Flexbox>
        </Flexbox>
      ) : (
        <Card className="mt-2">
          <CardBody>
            <Text lg semibold>
              No results
            </Text>
            <Text sm className="text-text-secondary">
              Try a different filter, or clear the filter to see the top recommended additions for this cube.
            </Text>
          </CardBody>
        </Card>
      )}

      {modalCard && (
        <AddToCubeModal
          card={modalCard}
          isOpen={modalCard !== null}
          setOpen={(open) => {
            if (!open) setModalCard(null);
          }}
          cubeContext={cube.id}
        />
      )}
    </div>
  );
};

export default Suggestions;
