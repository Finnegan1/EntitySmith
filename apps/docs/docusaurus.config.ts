import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Knowledge Graph Creator',
  tagline: 'A local-first desktop app for managing structured JSON datasets.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://finnegan1.github.io',
  baseUrl: '/knowledge-graph-creator/',

  organizationName: 'Finnegan1',
  projectName: 'knowledge-graph-creator',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/Finnegan1/knowledge-graph-creator/edit/main/apps/docs/',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Knowledge Graph Creator',
      logo: {
        alt: 'Knowledge Graph Creator Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/Finnegan1/knowledge-graph-creator',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction',      to: '/docs/' },
            { label: 'Installation',      to: '/docs/getting-started/installation' },
            { label: 'Architecture',      to: '/docs/architecture/overview' },
            { label: 'Data Model',        to: '/docs/data-model/dataset-schema' },
            { label: 'Adding a Feature',  to: '/docs/contributing/adding-a-feature' },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Finnegan1/knowledge-graph-creator',
            },
            {
              label: 'Issues',
              href: 'https://github.com/Finnegan1/knowledge-graph-creator/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Knowledge Graph Creator contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
