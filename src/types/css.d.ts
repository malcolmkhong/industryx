// Type declarations for non-TypeScript files imported in the project.
// This resolves the TS2882 error ("Cannot find module or type declarations
// for side-effect import of './globals.css'") by declaring that CSS files
// can be imported as side-effect modules.

declare module '*.css' {
  const content: never;
  export default content;
}
