import React from 'react';

import User from '@utils/datatypes/User';

import { Col, Flexbox, Row } from 'components/base/Layout';
import Text from 'components/base/Text';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import UserPreview from 'components/UserPreview';
import MainLayout from 'layouts/MainLayout';
import UserLayout from 'layouts/UserLayout';

interface UserFollowingPageProps {
  owner: User;
  followedUsers: User[];
  followersCount: number;
  followingCount: number;
  following: boolean;
  patronLevel?: number;
  likedCubesCount?: number;
  likedPackagesCount?: number;
}

const UserFollowingPage: React.FC<UserFollowingPageProps> = ({
  owner,
  followedUsers,
  followersCount,
  followingCount,
  following,
  patronLevel,
  likedCubesCount,
  likedPackagesCount,
}) => (
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
        <Text lg semibold>
          Following ({followedUsers.length})
        </Text>
        {followedUsers.length > 0 ? (
          <Row>
            {followedUsers.map((item) => (
              <Col key={item.id} xs={6} sm={4} md={3} lg={3} xl={2}>
                <UserPreview user={item} />
              </Col>
            ))}
          </Row>
        ) : (
          <Text className="text-text-secondary">Not following anyone yet.</Text>
        )}
      </Flexbox>
    </UserLayout>
  </MainLayout>
);

export default RenderToRoot(UserFollowingPage);
