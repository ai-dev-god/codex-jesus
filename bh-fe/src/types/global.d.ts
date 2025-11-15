/// <reference types="vite/client" />

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
}

