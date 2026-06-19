// useHostCommands — Tier 2 Active Embed hook.
//
// Host applications register command handlers that agents can invoke
// via vibeful-command blocks. When an agent emits a command like
// navigate, open-modal, or update-state, the corresponding handler fires.
//
// Usage in host app:
//   function MyApp() {
//     const router = useRouter();
//     const [modalOpen, setModalOpen] = useState(false);
//
//     useHostCommands({
//       navigate: ({ route }) => router.push(route),
//       'open-modal': ({ id }) => setModalOpen(true),
//       'update-state': ({ key, value }) => setAppState(prev => ({ ...prev, [key]: value })),
//       'scroll-to': ({ selector }) => document.querySelector(selector)?.scrollIntoView(),
//       'focus-element': ({ selector }) => document.querySelector(selector)?.focus(),
//       'set-theme': ({ theme }) => document.documentElement.setAttribute('data-theme', theme),
//     });
//   }

import { useEffect } from 'react';

export type CommandHandler = (details: Record<string, unknown>) => void | Promise<void>;

export type HostCommandMap = Record<string, CommandHandler>;

/**
 * Register handlers for agent-emitted host commands.
 * The agent emits commands via vibeful-command blocks:
 *   ```vibeful-command
 *   {"action":"navigate","details":{"route":"/settings"}}
 *   ```
 */
export function useHostCommands(handlers: HostCommandMap) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.action) return;
      const fn = handlers[detail.action];
      if (fn) {
        try {
          fn(detail.details || {});
        } catch (err) {
          console.error(`[Vibeful] Host command '${detail.action}' failed:`, err);
        }
      }
    };

    window.addEventListener('vibeful:host-command', handler);
    return () => window.removeEventListener('vibeful:host-command', handler);
  }, [handlers]);
}

/**
 * Manually dispatch a host command — called by the SDK when it parses
 * a vibeful-command block from an agent response with a recognized APP_COMMAND action.
 */
export function dispatchHostCommand(action: string, details: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('vibeful:host-command', { detail: { action, details } }));
}

/** Pre-defined command actions agents can use to drive host app UX */
export const HOST_COMMANDS = {
  NAVIGATE: 'navigate',
  OPEN_MODAL: 'open-modal',
  CLOSE_MODAL: 'close-modal',
  SCROLL_TO: 'scroll-to',
  UPDATE_STATE: 'update-state',
  CALL_API: 'call-api',
  SHOW_TOAST: 'show-toast',
  SET_THEME: 'set-theme',
  FOCUS_ELEMENT: 'focus-element',
  SUBMIT_FORM: 'submit-form',
} as const;
