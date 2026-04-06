/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.glsl' {
  const value: string;
  export default value;
}

declare const __APP_BUILD__: {
  version: string;
  sha: string;
  number: number;
  commitCount: number;
};
