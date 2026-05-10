import React, { useContext, useState } from 'react';

import { ChevronDownIcon } from '@primer/octicons-react';
import { cdnUrl } from '@utils/cdnUrl';
import classNames from 'classnames';

import Input from 'components/base/Input';
import Link from 'components/base/Link';
import UserContext from 'contexts/UserContext';

type SearchTab = 'cubes' | 'cards' | 'packages';

const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: 'cubes', label: 'Cubes' },
  { id: 'cards', label: 'Cards' },
  { id: 'packages', label: 'Packages' },
];

const buildSearchUrl = (tab: SearchTab, query: string): string => {
  const encoded = encodeURIComponent(query);
  switch (tab) {
    case 'cubes':
      return `/search?q=${encoded}`;
    case 'cards':
      return `/tool/searchcards?f=${encoded}`;
    case 'packages':
      return `/packages?q=${encoded}`;
  }
};

type ChipSuggestion = { label: string; href: string };

const SUGGESTIONS: Partial<Record<SearchTab, ChipSuggestion[]>> = {
  cubes: [
    { label: 'Vintage', href: '/search?q=category%3A%22Vintage%22' },
    { label: 'Pauper', href: '/search?q=category%3A%22Pauper%22' },
    { label: 'Desert', href: '/search?q=category%3A%22Desert%22' },
  ],
  packages: [
    { label: 'Shocklands', href: '/packages?q=Shocklands' },
    { label: 'Fetches', href: '/packages?q=Fetches' },
    { label: 'Signets', href: '/packages?q=Signets' },
  ],
};

const HeroSearch: React.FC = () => {
  const user = useContext(UserContext);
  const [activeTab, setActiveTab] = useState<SearchTab>('cubes');
  const [query, setQuery] = useState('');

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    window.location.href = buildSearchUrl(activeTab, trimmed);
  };

  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-bg-secondary">
      <img
        src={cdnUrl('/content/cobracube.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-top select-none pointer-events-none"
      />
      <div className="absolute inset-0 bg-bg-secondary/80" />
      <div className="relative h-full w-full flex items-center justify-center px-4">
        <div className="w-full max-w-3xl flex flex-col items-center text-center">
          <img
            src={cdnUrl('/content/banner_textonly.png')}
            alt="CubeCobra"
            draggable={false}
            className="w-full max-w-2xl select-none pointer-events-none"
          />
          <p className="mt-3 text-base text-button-text">The home for Magic: The Gathering Cube</p>
          <div className="mt-12 flex flex-wrap justify-center items-center gap-2">
            <span className="text-button-text font-semibold">Search:</span>
            {SEARCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  'px-4 py-1 rounded-full text-sm font-semibold border focus:outline-none transition-colors',
                  activeTab === tab.id
                    ? 'bg-button-text text-bg-secondary border-button-text hover:bg-button-text/90'
                    : 'bg-transparent text-button-text border-button-text hover:bg-button-text/15',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-3 w-full max-w-md">
            <Input
              name="q"
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onEnter={submit}
              className="!bg-white !text-gray-800 !placeholder-gray-500 !border-gray-300"
            />
          </div>
          <div className="mt-3 h-8 flex flex-wrap justify-center items-center gap-2">
            {SUGGESTIONS[activeTab] && (
              <>
                <span className="text-sm text-button-text/80">Try:</span>
                {SUGGESTIONS[activeTab]!.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-bg-secondary/40 text-button-text border border-button-text/40 transition-colors hover:bg-button-text/20 hover:border-button-text"
                  >
                    {s.label}
                  </a>
                ))}
              </>
            )}
          </div>
          {!user && (
            <Link
              href="/user/register"
              className="mt-10 inline-block !text-button-text hover:!text-button-text !text-2xl md:!text-3xl !font-bold underline-offset-4 hover:underline"
            >
              Register to start creating a cube!
            </Link>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={scrollToContent}
        className="absolute bottom-20 md:bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center text-button-text focus:outline-none"
        aria-label="Scroll to content"
      >
        <span className="text-xs font-semibold">EXPLORE MORE</span>
        <ChevronDownIcon size={20} />
      </button>
      <a
        href="https://bsky.app/profile/firosart.bsky.social"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-20 md:bottom-2 right-3 text-xs text-button-text/60 hover:text-button-text underline-offset-2 hover:underline"
      >
        Art by Santiago Rosas
      </a>
    </div>
  );
};

export default HeroSearch;
