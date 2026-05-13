import React, { useCallback, useContext, useState } from 'react';

import User from '@utils/datatypes/User';

import { Col, Flexbox, Row } from 'components/base/Layout';
import Pagination from 'components/base/Pagination';
import Text from 'components/base/Text';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import UserPreview from 'components/UserPreview';
import { CSRFContext } from 'contexts/CSRFContext';
import MainLayout from 'layouts/MainLayout';
import UserLayout from 'layouts/UserLayout';

const PAGE_SIZE = 36;

interface UserFollowingPageProps {
  owner: User;
  followedUsers: User[];
  lastKey?: any;
  followersCount: number;
  followingCount: number;
  following: boolean;
  patronLevel?: number;
  likedCubesCount?: number;
  likedPackagesCount?: number;
}

const UserFollowingPage: React.FC<UserFollowingPageProps> = ({
  owner,
  followedUsers: initialFollowedUsers,
  lastKey: initialLastKey,
  followersCount,
  followingCount,
  following,
  patronLevel,
  likedCubesCount,
  likedPackagesCount,
}) => {
  const { csrfFetch } = useContext(CSRFContext);
  const [items, setItems] = useState<User[]>(initialFollowedUsers);
  const [currentLastKey, setLastKey] = useState<any>(initialLastKey);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const hasMore = !!currentLastKey;

  const fetchMore = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      const response = await csrfFetch(`/user/following/getmore/${owner.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastKey: currentLastKey }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success === 'true') {
          const newItems = [...items, ...(json.followedUsers || [])];
          setItems(newItems);
          setLastKey(json.lastKey);

          const newPageCount = Math.max(1, Math.ceil(newItems.length / PAGE_SIZE));
          setPage(Math.max(0, Math.min(targetPage, newPageCount - 1)));
        }
      }
      setLoading(false);
    },
    [csrfFetch, owner.id, currentLastKey, items],
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
  const headerCount = followingCount ?? totalShown;

  return (
    <MainLayout>
      <UserLayout
        user={owner}
        followersCount={followersCount}
        followingCount={followingCount}
        following={following}
        activeLink="following"
        patronLevel={patronLevel}
        likedCubesCount={likedCubesCount}
        likedPackagesCount={likedPackagesCount}
      >
        <DynamicFlash />
        <Flexbox direction="col" gap="2" className="mt-3 w-full">
          <Flexbox direction="row" justify="between" alignItems="center" wrap="wrap" gap="2">
            <Text lg semibold>
              Following ({headerCount})
            </Text>
            {totalShown > 0 && pager}
          </Flexbox>
          {totalShown > 0 ? (
            <Row>
              {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item) => (
                <Col key={item.id} xs={6} sm={4} md={3} lg={3} xl={2}>
                  <UserPreview user={item} />
                </Col>
              ))}
            </Row>
          ) : (
            <Text className="text-text-secondary">Not following anyone yet.</Text>
          )}
          {totalShown > 0 && (
            <Flexbox direction="row" justify="end" alignItems="center" className="w-full mt-3">
              {pager}
            </Flexbox>
          )}
        </Flexbox>
      </UserLayout>
    </MainLayout>
  );
};

export default RenderToRoot(UserFollowingPage);
