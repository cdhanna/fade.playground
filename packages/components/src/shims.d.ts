// See @fadebasic/editor — Vite's `?worker` suffix returns a Worker
// constructor. Declared here too so tsc resolves it when this package's
// typecheck follows imports into the editor package.
declare module '*?worker' {
    const WorkerFactory: { new (): Worker };
    export default WorkerFactory;
}

// CSS imports (codicons) are handled by the consumer's bundler (Vite); this
// keeps tsc happy.
declare module '*.css';
