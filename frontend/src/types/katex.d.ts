declare module 'katex' {
  interface KatexOptions {
    displayMode?: boolean;
    throwOnError?: boolean;
    errorColor?: string;
    strict?: boolean;
  }

  function render(tex: string, element: HTMLElement, options?: KatexOptions): void;
  
  export { render, KatexOptions };
}
