import React from 'react';

import Cube from '@utils/datatypes/Cube';

import HeroSearch from 'components/HeroSearch';
import RenderToRoot from 'components/RenderToRoot';
import MainLayout from 'layouts/MainLayout';

interface LandingPageProps {
  featured: Cube[];
}

const LandingPage: React.FC<LandingPageProps> = ({ featured }) => {
  return (
    <MainLayout useContainer={false} transparentNav>
      <HeroSearch featured={featured} showExploreMore={false} />
    </MainLayout>
  );
};

export default RenderToRoot(LandingPage);
