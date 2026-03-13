import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const FEATURES = [
  {
    title: 'Local-first',
    description:
      'All data stays on your disk. No servers, no accounts, no network calls. Open any folder as a workspace.',
  },
  {
    title: 'Inline editing',
    description:
      'Click any cell to edit it. Press Enter or click away to commit. Cmd/Ctrl+S saves the file back to disk.',
  },
  {
    title: 'Schema management',
    description:
      'Add a new column to every row with a single action. Remove columns with a confirmation step. Changes are atomic across all entries.',
  },
  {
    title: 'Validation feedback',
    description:
      'Files that don\'t match the expected schema show a red Error badge and a detailed breakdown of exactly what is wrong.',
  },
  {
    title: 'Multi-workspace',
    description:
      'Manage multiple folders at once. Workspace paths are persisted across sessions — reopen the app and pick up where you left off.',
  },
  {
    title: 'Built on Electron + React',
    description:
      'Electron 41, React 19, TypeScript, Tailwind CSS 4, shadcn/ui. Standard tooling — no proprietary frameworks.',
  },
];

function Feature({title, description}: {title: string; description: string}) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className="padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/">
            Get started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            href="https://github.com/Finnegan1/knowledge-graph-creator">
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="A local-first desktop app for managing structured JSON datasets.">
      <HomepageHeader />
      <main>
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              {FEATURES.map((f) => (
                <Feature key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
