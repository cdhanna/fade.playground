// Vite's `?worker` import suffix returns a Worker constructor. Consumers of
// this package bundle with Vite, which understands it; this declaration keeps
// tsc happy when typechecking the package in isolation.
declare module '*?worker' {
    const WorkerFactory: { new (): Worker };
    export default WorkerFactory;
}
