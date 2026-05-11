import React from 'react';

import type { Icon as OcticonIcon } from '@primer/octicons-react';
import {
  ArchiveIcon,
  ArrowSwitchIcon,
  BookIcon,
  BroadcastIcon,
  BrowserIcon,
  ChevronDownIcon,
  CommentDiscussionIcon,
  LinkExternalIcon,
  SearchIcon,
  ToolsIcon,
  TrophyIcon,
  VideoIcon,
} from '@primer/octicons-react';
import { cdnUrl } from '@utils/cdnUrl';
import Podcast from '@utils/datatypes/Podcast';

import Banner from 'components/Banner';
import { Card, CardBody, CardHeader } from 'components/base/Card';
import Container from 'components/base/Container';
import { Flexbox } from 'components/base/Layout';
import ResponsiveDiv from 'components/base/ResponsiveDiv';
import Text from 'components/base/Text';
import RenderToRoot from 'components/RenderToRoot';
import SideBanner from 'components/SideBanner';
import MainLayout from 'layouts/MainLayout';

interface ResourcesPageProps {
  podcasts: Podcast[];
}

interface HeroLink {
  label: string;
  href: string;
  description: string;
  Icon: OcticonIcon;
}

const COMMUNITY_TOOLS: HeroLink[] = [
  {
    label: 'Cube Comparison Tool',
    href: 'https://cube.griselbrand.com/',
    description: 'Compare a list of multiple cubes at once to find overlap, differences, and patterns.',
    Icon: ArrowSwitchIcon,
  },
  {
    label: 'Cogwork Librarian',
    href: 'https://coglib.sosk.watch/',
    description: 'A powerful query language for slicing cube lists when Scryfall syntax is not enough.',
    Icon: SearchIcon,
  },
  {
    label: 'Lucky Paper Resources',
    href: 'https://luckypaper.co/resources/',
    description: 'Rotisserie Draft, Set Cube Builder, List Formatter, the Cube Map, and more.',
    Icon: ToolsIcon,
  },
];

const CONTENT_ARCHIVE: HeroLink[] = [
  {
    label: 'Browse All',
    href: '/content/browse',
    description: 'Articles, videos, and episodes in one feed',
    Icon: BrowserIcon,
  },
  {
    label: 'Articles',
    href: '/content/articles',
    description: 'Long-form writing from the community',
    Icon: BookIcon,
  },
  {
    label: 'Videos',
    href: '/content/videos',
    description: 'Cube content on video',
    Icon: VideoIcon,
  },
];

const CUBE_COMMUNITIES: HeroLink[] = [
  {
    label: 'r/mtgcube',
    href: 'https://www.reddit.com/r/mtgcube/',
    description: 'The Magic: The Gathering Cube subreddit — list shares, discussion, and questions.',
    Icon: CommentDiscussionIcon,
  },
  {
    label: 'MTG Cube Talk Discord',
    href: 'https://discordapp.com/invite/tFBZ2Z3',
    description: 'An active Discord for live conversation about cube design, drafts, and the format at large.',
    Icon: CommentDiscussionIcon,
  },
  {
    label: 'Cube Cobra Discord',
    href: 'https://discord.gg/YYF9x65Ane',
    description: 'Site help, bug reports, and feature requests for Cube Cobra itself.',
    Icon: CommentDiscussionIcon,
  },
];

const HeroLinkCard: React.FC<HeroLink> = ({ label, href, description, Icon }) => {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group flex flex-col items-center text-center gap-2 p-4 rounded-lg border border-button-text/30 bg-bg-secondary/40 backdrop-blur-sm text-button-text hover:bg-bg-secondary/70 hover:border-button-text transition-colors"
    >
      <Icon size={32} />
      <Text lg semibold className="!text-button-text">
        {label}
      </Text>
      <Text sm className="text-button-text/70">
        {description}
      </Text>
    </a>
  );
};

const HeroSection: React.FC<{ icon: OcticonIcon; title: string; links: HeroLink[]; cols: 2 | 3 }> = ({
  icon: Icon,
  title,
  links,
  cols,
}) => (
  <div className="w-full">
    <Flexbox direction="row" alignItems="center" justify="center" gap="2" className="mb-3">
      <Icon size={16} />
      <Text sm semibold className="uppercase tracking-widest text-button-text/80">
        {title}
      </Text>
    </Flexbox>
    <div className={`grid grid-cols-1 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
      {links.map((link) => (
        <HeroLinkCard key={link.href} {...link} />
      ))}
    </div>
  </div>
);

const BodyLinkSection: React.FC<{ icon: OcticonIcon; title: string; links: HeroLink[] }> = ({
  icon: Icon,
  title,
  links,
}) => (
  <Card>
    <CardHeader>
      <Flexbox direction="row" alignItems="center" gap="2">
        <Icon size={20} />
        <Text semibold xl>
          {title}
        </Text>
      </Flexbox>
    </CardHeader>
    <CardBody>
      <div className="grid grid-cols-1 gap-3">
        {links.map(({ label, href, description }) => {
          const isExternal = href.startsWith('http');
          return (
            <a
              key={href}
              href={href}
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="group flex flex-col gap-1 p-3 rounded-lg border border-border bg-bg hover:border-border-active transition-colors"
            >
              <Flexbox direction="row" alignItems="center" justify="between" gap="2">
                <Text lg semibold>
                  {label}
                </Text>
                {isExternal && (
                  <span className="text-text-secondary group-hover:text-text">
                    <LinkExternalIcon size={14} />
                  </span>
                )}
              </Flexbox>
              <Text sm className="text-text-secondary">
                {description}
              </Text>
            </a>
          );
        })}
      </div>
    </CardBody>
  </Card>
);

const ResourcesPage: React.FC<ResourcesPageProps> = ({ podcasts }) => {
  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <MainLayout useContainer={false} transparentNav>
      {/* HERO */}
      <div className="relative w-full min-h-screen overflow-hidden bg-bg-secondary">
        <img
          src={cdnUrl('/content/skullsnake.webp')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover object-top select-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-bg-secondary/80" />

        <div className="relative w-full min-h-screen flex items-center justify-center px-4 py-24">
          <div className="w-full max-w-5xl flex flex-col items-center text-center gap-10">
            <div>
              <Text xxxxl bold className="!text-button-text block">
                Resources
              </Text>
              <p className="mt-2 text-base text-button-text/80">
                Cube tools, archives, and content from across the community.
              </p>
            </div>

            <HeroSection icon={ToolsIcon} title="Community Tools" links={COMMUNITY_TOOLS} cols={3} />

            <div className="hidden md:block w-full">
              <HeroSection icon={ArchiveIcon} title="Content Archive" links={CONTENT_ARCHIVE} cols={3} />
            </div>

            <div className="hidden md:block w-full">
              <HeroSection icon={CommentDiscussionIcon} title="Cube Communities" links={CUBE_COMMUNITIES} cols={3} />
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[6vh] bg-gradient-to-b from-transparent to-bg pointer-events-none" />

        <button
          type="button"
          onClick={scrollToContent}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center text-button-text focus:outline-none z-10"
          aria-label="Scroll to content"
        >
          <span className="text-xs font-semibold">EXPLORE MORE</span>
          <ChevronDownIcon size={20} />
        </button>
        <a
          href="https://cara.app/diosrevoredo/all"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-20 right-3 text-xs text-button-text/70 hover:text-button-text underline-offset-2 hover:underline z-[15]"
        >
          Art by Dios Revoredo
        </a>
      </div>

      {/* BELOW HERO */}
      <Container xxxl>
        <Flexbox direction="row" gap="4">
          <ResponsiveDiv xxl className="pl-2 py-2 min-w-fit">
            <SideBanner placementId="left-rail" />
          </ResponsiveDiv>
          <div className="flex-grow px-2 py-6 max-w-full min-w-0">
            <Flexbox direction="col" gap="6">
              {/* Mobile-only: Content Archive + Cube Communities pulled out of hero */}
              <div className="md:hidden">
                <BodyLinkSection icon={ArchiveIcon} title="Content Archive" links={CONTENT_ARCHIVE} />
              </div>
              <div className="md:hidden">
                <BodyLinkSection icon={CommentDiscussionIcon} title="Cube Communities" links={CUBE_COMMUNITIES} />
              </div>

              <Banner />

              {/* Cube Map */}
              <Card>
                <CardHeader>
                  <Text semibold xl>
                    Looking for more cubes?
                  </Text>
                </CardHeader>
                <a href="https://luckypaper.co/resources/cube-map/" target="_blank" rel="noopener noreferrer">
                  <img className="w-full" src={cdnUrl('/content/cubemap.png')} alt="Cube Map" />
                </a>
                <CardBody>
                  <Text>
                    Discover just how diverse the Cube format can be, themes you never expected, and where your own cube
                    fits.
                  </Text>
                </CardBody>
              </Card>

              {/* Hedron Network */}
              <Card>
                <CardHeader>
                  <Flexbox direction="row" alignItems="center" gap="2">
                    <TrophyIcon size={20} />
                    <Text semibold xl>
                      Hedron Network
                    </Text>
                  </Flexbox>
                </CardHeader>
                <a href="https://hedron.network/" target="_blank" rel="noopener noreferrer">
                  <img className="w-full" src={cdnUrl('/content/hedron.png')} alt="Hedron Network" />
                </a>
                <CardBody>
                  <Flexbox direction="col" gap="3">
                    <Text>
                      Tournament software built for cube events. Host your own cube tournaments, manage pairings and
                      standings, or discover cube events happening near you.
                    </Text>
                    <a
                      href="https://hedron.network/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-link hover:text-link-active font-semibold w-fit"
                    >
                      Visit Hedron Network
                      <LinkExternalIcon size={14} />
                    </a>
                  </Flexbox>
                </CardBody>
              </Card>

              <Banner />

              {/* Podcasts */}
              <Card>
                <CardHeader>
                  <Flexbox direction="row" alignItems="center" justify="between">
                    <Flexbox direction="row" alignItems="center" gap="2">
                      <BroadcastIcon size={20} />
                      <Text semibold xl>
                        Podcasts
                      </Text>
                    </Flexbox>
                    <a href="/content/podcasts" className="text-link hover:text-link-active text-sm font-semibold">
                      View all podcasts
                    </a>
                  </Flexbox>
                </CardHeader>
                <CardBody>
                  {podcasts.length === 0 ? (
                    <Text className="text-text-secondary">No podcasts yet.</Text>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {podcasts.map((podcast) => (
                        <a
                          key={podcast.id}
                          href={`/content/podcast/${podcast.id}`}
                          className="group flex gap-3 p-3 rounded-lg border border-border bg-bg hover:border-border-active transition-colors"
                        >
                          {podcast.image && (
                            <img src={podcast.image} alt="" className="w-20 h-20 object-cover rounded flex-shrink-0" />
                          )}
                          <div className="flex flex-col gap-1 min-w-0">
                            <Text semibold lg className="truncate">
                              {podcast.title}
                            </Text>
                            <Text sm className="text-text-secondary line-clamp-2">
                              {podcast.description}
                            </Text>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </Flexbox>
          </div>
          <ResponsiveDiv lg className="pr-2 py-2 min-w-fit">
            <SideBanner placementId="right-rail" />
          </ResponsiveDiv>
        </Flexbox>
      </Container>
    </MainLayout>
  );
};

export default RenderToRoot(ResourcesPage);
