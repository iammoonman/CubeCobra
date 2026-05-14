import React, { useCallback, useContext, useState } from 'react';

import Card, { BoardType } from '@utils/datatypes/Card';
import Cube from '@utils/datatypes/Cube';
import User from '@utils/datatypes/User';

import { Card as BaseCard, CardBody, CardHeader } from 'components/base/Card';
import { Col, Flexbox, Row } from 'components/base/Layout';
import Pagination from 'components/base/Pagination';
import Text from 'components/base/Text';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import UserPreview from 'components/UserPreview';
import { CSRFContext } from 'contexts/CSRFContext';
import CubeLayout from 'layouts/CubeLayout';
import MainLayout from 'layouts/MainLayout';

const PAGE_SIZE = 36;

interface CubeFollowersPageProps {
  cube: Cube;
  cards: Record<BoardType, Card[]>;
  followers: User[];
  lastKey?: any;
}

const CubeFollowersPage: React.FC<CubeFollowersPageProps> = ({
  cube,
  cards,
  followers: initialFollowers,
  lastKey: initialLastKey,
}) => {
  const { csrfFetch } = useContext(CSRFContext);
  const [items, setItems] = useState<User[]>(initialFollowers);
  const [currentLastKey, setLastKey] = useState<any>(initialLastKey);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!currentLastKey;

  const fetchMore = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      const response = await csrfFetch(`/cube/followers/getmore/${cube.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastKey: currentLastKey }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success === 'true') {
          const newItems = [...items, ...(json.followers || [])];
          setItems(newItems);
          setLastKey(json.lastKey);

          const newPageCount = Math.max(1, Math.ceil(newItems.length / PAGE_SIZE));
          setPage(Math.max(0, Math.min(targetPage, newPageCount - 1)));
        }
      }
      setLoading(false);
    },
    [csrfFetch, cube.id, currentLastKey, items],
  );

  const pager = (
    <Pagination
      count={pageCount}
      active={page}
      hasMore={hasMore}
      onClick={async (newPage) => {
        if (newPage >= pageCount) {
          await fetchMore(newPage);
        } else {
          setPage(newPage);
        }
      }}
      loading={loading}
    />
  );

  const totalShown = items.length;
  const headerCount = cube.likeCount ?? totalShown;

  return (
    <MainLayout useContainer={false}>
      <CubeLayout cube={cube} cards={cards} activeLink="followers">
        <DynamicFlash />
        <BaseCard className="my-3">
          <CardHeader>
            <Flexbox direction="row" justify="between" alignItems="center" wrap="wrap" gap="2">
              <Text lg semibold>
                Likes ({headerCount})
              </Text>
              {totalShown > 0 && pager}
            </Flexbox>
          </CardHeader>
          {totalShown > 0 ? (
            <CardBody className="p-0">
              <Row className="g-0">
                {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((user) => (
                  <Col key={user.id} xs={6} sm={4} md={3} lg={3} xl={2}>
                    <UserPreview user={user} />
                  </Col>
                ))}
              </Row>
            </CardBody>
          ) : (
            <CardBody>
              <Text className="text-text-secondary">No likes yet.</Text>
            </CardBody>
          )}
          {totalShown > 0 && (
            <CardBody className="border-t border-border">
              <Flexbox direction="row" justify="end" alignItems="center" className="w-full">
                {pager}
              </Flexbox>
            </CardBody>
          )}
        </BaseCard>
      </CubeLayout>
    </MainLayout>
  );
};

export default RenderToRoot(CubeFollowersPage);
