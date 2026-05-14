import React from 'react';

import Cube from '@utils/datatypes/Cube';
import User from '@utils/datatypes/User';

import { Flexbox } from 'components/base/Layout';
import Text from 'components/base/Text';
import CubePreview from 'components/cube/CubePreview';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import MainLayout from 'layouts/MainLayout';
import UserLayout from 'layouts/UserLayout';

interface LikedCubesPageProps {
  owner: User;
  cubes: Cube[];
  followersCount: number;
  followingCount: number;
  following: boolean;
  patronLevel?: number;
  likedCubesCount?: number;
  likedPackagesCount?: number;
}

const LikedCubesPage: React.FC<LikedCubesPageProps> = ({
  owner,
  cubes,
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
      activeLink="liked-cubes"
      patronLevel={patronLevel}
      likedCubesCount={likedCubesCount}
      likedPackagesCount={likedPackagesCount}
    >
      <DynamicFlash />
      <Flexbox direction="col" className="mt-3" gap="2">
        <Text lg semibold>
          Liked Cubes ({cubes.length})
        </Text>
        {cubes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 5xl:grid-cols-6">
            {cubes.map((cube) => (
              <CubePreview key={cube.id} cube={cube} />
            ))}
          </div>
        ) : (
          <Text className="text-text-secondary">No liked cubes yet.</Text>
        )}
      </Flexbox>
    </UserLayout>
  </MainLayout>
);

export default RenderToRoot(LikedCubesPage);
