import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/first-workspace',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/ipc-layer',
        'architecture/state-management',
      ],
    },
    {
      type: 'category',
      label: 'Data Model',
      items: [
        'data-model/dataset-schema',
        'data-model/validation',
      ],
    },
    {
      type: 'category',
      label: 'Components',
      items: [
        'components/overview',
        'components/workspace-sidebar',
        'components/dataset-view',
        'components/dataset-table',
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/adding-a-feature',
        'contributing/gotchas',
      ],
    },
  ],
};

export default sidebars;
