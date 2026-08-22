'use client';

import { useCallback, useState } from 'react';
import IglooScene from '../components/IglooScene';

export default function HomePage() {
  const [blockCount, setBlockCount] = useState(null);
  const [sceneReady, setSceneReady] = useState(false);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  return (
    <main
      className={`experience ${sceneReady ? 'is-scene-ready' : 'is-scene-loading'}`}
      aria-busy={!sceneReady}
    >
      <div
        className="splash"
        role="status"
        aria-live="polite"
        aria-label={sceneReady ? 'Interactive shelter ready' : 'Building the interactive shelter'}
        aria-hidden={sceneReady}
      >
        <div className="splash-grain" aria-hidden="true" />
        <div className="splash-assembly" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="splash-copy">
          <p className="splash-kicker">IGLOO / PROCEDURAL STUDY 001</p>
          <p className="splash-title">Assembling the shelter</p>
          <p className="splash-detail">Generating geometry / mapping 163 blocks</p>
        </div>
        <div className="splash-track" aria-hidden="true">
          <span />
        </div>
        <p className="splash-index">MODEL 001&nbsp;&nbsp; / &nbsp;&nbsp;PLEASE HOLD</p>
      </div>

      <header className="topbar" aria-label="Site header">
        <a className="brand" href="/" aria-label="Igloo home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>IGLOO</span>
        </a>

        <p className="edition">STUDY 001&nbsp;&nbsp; / &nbsp;&nbsp;2026</p>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> A PROCEDURAL FIELD STUDY
          </p>
          <h1 id="hero-title">
            A shelter,
            <br />
            written block
            <br />
            by block.
          </h1>
          <p className="intro">
            A live experiment in whether code can shape 163 individual pieces
            into one habitable form.
          </p>
        </div>

        <IglooScene
          onBlockCount={setBlockCount}
          onReady={handleSceneReady}
        />

        <aside className="object-note" aria-label="Object details">
          <span className="object-number">01</span>
          <div>
            <p>OBJECT</p>
            <strong>CODE-BUILT SHELTER</strong>
          </div>
        </aside>
      </section>

      <footer className="footer">
        <p>SCROLL / ORBIT&nbsp;&nbsp;&nbsp; CONTINUE / DECONSTRUCT</p>
        <p className="block-count">
          <span>{blockCount === null ? '—' : String(blockCount).padStart(3, '0')}</span>
          <span className="count-label"> INDIVIDUAL BLOCKS</span>
        </p>
      </footer>
    </main>
  );
}
