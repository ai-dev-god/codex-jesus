/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

export {};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: Record<string, unknown>) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton?: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }

  namespace google {
    namespace accounts {
      namespace id {
        function initialize(options: Record<string, unknown>): void;
        function prompt(callback?: (notification: any) => void): void;
        function renderButton(element: HTMLElement, options: Record<string, unknown>): void;
      }
    }
  }

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}

