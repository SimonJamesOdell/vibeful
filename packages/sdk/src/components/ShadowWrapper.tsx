// Shadow DOM wrapper for style isolation
import React, { useRef, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface ShadowWrapperProps {
  children: React.ReactNode;
  styles?: string;
  tagName?: string;
}

export function ShadowWrapper({ children, styles = '', tagName = 'vibeful-agent' }: ShadowWrapperProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.shadowRoot) return;

    const shadow = host.attachShadow({ mode: 'open' });

    // Inject base styles
    if (styles) {
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      shadow.appendChild(styleEl);
    }

    // Create mount point
    const mount = document.createElement('div');
    mount.id = 'vibeful-root';
    shadow.appendChild(mount);

    // Store mount reference
    (host as any).__vibefulMount = mount;
    setReady(true);
  }, [styles]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = (host as any)?.__vibefulMount;
    if (!ready || !mount) return;

    const root = createRoot(mount);
    root.render(<>{children}</>);
    return () => root.unmount();
  }, [ready, children]);

  return <div ref={hostRef} style={{ display: 'contents' }} />;
}
